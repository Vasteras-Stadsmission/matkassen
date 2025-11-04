import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Integration tests for encrypted database backup scripts
 *
 * These tests verify the backup/restore flow without requiring a real PostgreSQL instance.
 * They use dependency injection to replace pg_dump/pg_restore with mock data generators.
 *
 * Test Philosophy:
 * - No database required (uses cat/echo to simulate pg_dump output)
 * - Tests encryption/decryption flow end-to-end
 * - Verifies checksum generation and validation
 * - Validates error handling (missing passphrase, corrupted files)
 *
 * Why Shell Scripts Instead of TypeScript:
 * - Backup scripts run in Alpine Linux containers (not Node.js environment)
 * - Testing shell script logic requires actual shell execution
 * - Integration tests are more valuable than unit tests for deployment scripts
 *
 * Limitations:
 * - Requires gpg installed (checks and skips if unavailable)
 * - Cannot test real database backup without PostgreSQL
 * - Manual verification still recommended for production deployments
 */

describe("Encrypted Database Backup Scripts", () => {
    const testDir = path.join(os.tmpdir(), `backup-test-${Date.now()}`);
    const backupScript = path.join(process.cwd(), "scripts/db-backup.sh");
    const restoreScript = path.join(process.cwd(), "scripts/db-restore.sh");
    const testPassphrase = "test-passphrase-for-backup-encryption-testing-only";
    const mockDbData = "-- PostgreSQL dump\nCREATE TABLE test (id INT);";

    // Check if gpg is available
    const hasGpg = (() => {
        try {
            execSync("which gpg", { stdio: "ignore" });
            return true;
        } catch {
            return false;
        }
    })();

    beforeAll(() => {
        // Skip all tests if gpg is not available
        if (!hasGpg) {
            console.warn("⚠️  Skipping backup encryption tests: gpg is not installed");
            console.warn("   Install gpg: apt-get install gnupg");
        }

        // Create test directory
        fs.mkdirSync(testDir, { recursive: true });

        // Make scripts executable
        fs.chmodSync(backupScript, 0o755);
        fs.chmodSync(restoreScript, 0o755);
    });

    afterAll(() => {
        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it("should fail when DB_BACKUP_PASSPHRASE is not set", () => {
        if (!hasGpg) return; // Skip if gpg not available

        // Run backup without passphrase
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            BACKUP_TARGET_DIR: testDir,
            POSTGRES_HOST: "localhost",
            POSTGRES_USER: "test",
            POSTGRES_DB: "test",
            POSTGRES_PASSWORD: "test",
        };
        // Remove passphrase if it exists
        delete (env as any).DB_BACKUP_PASSPHRASE;

        expect(() => {
            execSync(backupScript, {
                env,
                stdio: "pipe",
                encoding: "utf-8",
            });
        }).toThrow();
    });

    it("should create encrypted backup with checksum when passphrase is set", () => {
        if (!hasGpg) return; // Skip if gpg not available

        // Create mock pg_dump that outputs test data
        const mockPgDump = path.join(testDir, "pg_dump");
        fs.writeFileSync(mockPgDump, `#!/bin/bash\necho "${mockDbData}"\n`, {
            encoding: "utf-8",
        });
        fs.chmodSync(mockPgDump, 0o755);

        // Run backup with mocked pg_dump
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            DB_BACKUP_PASSPHRASE: testPassphrase,
            BACKUP_TARGET_DIR: testDir,
            POSTGRES_HOST: "localhost",
            POSTGRES_USER: "test",
            POSTGRES_DB: "test",
            POSTGRES_PASSWORD: "test",
            PATH: `${path.dirname(mockPgDump)}:${process.env.PATH}`,
        };

        try {
            execSync(backupScript, {
                env,
                stdio: "pipe",
                encoding: "utf-8",
            });
        } catch (error: any) {
            console.error("Backup script failed:", error.stderr);
            throw error;
        }

        // Verify encrypted backup was created
        const files = fs.readdirSync(testDir);
        const backupFiles = files.filter(f => f.endsWith(".sql.gpg"));
        expect(backupFiles.length).toBeGreaterThan(0);

        const backupFile = backupFiles[0];
        const checksumFile = `${backupFile}.sha256`;

        // Verify checksum file exists
        expect(fs.existsSync(path.join(testDir, checksumFile))).toBe(true);

        // Verify backup is not plaintext (should be encrypted)
        const backupContent = fs.readFileSync(path.join(testDir, backupFile), "utf-8");
        expect(backupContent).not.toContain("-- PostgreSQL dump");
        expect(backupContent).not.toContain("CREATE TABLE");
    });

    it("should restore encrypted backup with --force flag", () => {
        if (!hasGpg) return; // Skip if gpg not available

        // Find the backup file from previous test
        const files = fs.readdirSync(testDir);
        const backupFiles = files.filter(f => f.endsWith(".sql.gpg"));

        if (backupFiles.length === 0) {
            console.warn("No backup files found - skipping restore test");
            return;
        }

        const backupFile = path.join(testDir, backupFiles[0]);

        // Create mock pg_restore that captures input
        const mockPgRestore = path.join(testDir, "pg_restore");
        const restoreOutput = path.join(testDir, "restore-output.txt");
        fs.writeFileSync(
            mockPgRestore,
            `#!/bin/bash\ncat > ${restoreOutput}\necho "Restore completed"\n`,
            { encoding: "utf-8" },
        );
        fs.chmodSync(mockPgRestore, 0o755);

        // Run restore with mocked pg_restore
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            DB_BACKUP_PASSPHRASE: testPassphrase,
            POSTGRES_HOST: "localhost",
            POSTGRES_USER: "test",
            POSTGRES_DB: "test",
            POSTGRES_PASSWORD: "test",
            PATH: `${path.dirname(mockPgRestore)}:${process.env.PATH}`,
        };

        try {
            execSync(`${restoreScript} ${backupFile} --force`, {
                env,
                stdio: "pipe",
                encoding: "utf-8",
            });
        } catch (error: any) {
            console.error("Restore script failed:", error.stderr);
            throw error;
        }

        // Verify restored data matches original
        const restoredContent = fs.readFileSync(restoreOutput, "utf-8");
        expect(restoredContent).toContain("-- PostgreSQL dump");
        expect(restoredContent).toContain("CREATE TABLE test");
    });

    it("should fail restore without --force flag", () => {
        if (!hasGpg) return; // Skip if gpg not available

        const files = fs.readdirSync(testDir);
        const backupFiles = files.filter(f => f.endsWith(".sql.gpg"));

        if (backupFiles.length === 0) {
            console.warn("No backup files found - skipping restore test");
            return;
        }

        const backupFile = path.join(testDir, backupFiles[0]);

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            DB_BACKUP_PASSPHRASE: testPassphrase,
            POSTGRES_HOST: "localhost",
            POSTGRES_USER: "test",
            POSTGRES_DB: "test",
            POSTGRES_PASSWORD: "test",
        };

        expect(() => {
            execSync(`${restoreScript} ${backupFile}`, {
                env,
                stdio: "pipe",
                encoding: "utf-8",
            });
        }).toThrow();
    });

    it("should verify checksum during restore", () => {
        if (!hasGpg) return; // Skip if gpg not available

        const files = fs.readdirSync(testDir);
        const backupFiles = files.filter(f => f.endsWith(".sql.gpg"));

        if (backupFiles.length === 0) {
            console.warn("No backup files found - skipping checksum test");
            return;
        }

        const backupFile = path.join(testDir, backupFiles[0]);
        const checksumFile = `${backupFile}.sha256`;

        // Corrupt the checksum file
        fs.writeFileSync(checksumFile, "0000000000000000 backup.sql.gpg\n");

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            DB_BACKUP_PASSPHRASE: testPassphrase,
            POSTGRES_HOST: "localhost",
            POSTGRES_USER: "test",
            POSTGRES_DB: "test",
            POSTGRES_PASSWORD: "test",
        };

        // Restore should fail due to checksum mismatch
        expect(() => {
            execSync(`${restoreScript} ${backupFile} --force`, {
                env,
                stdio: "pipe",
                encoding: "utf-8",
            });
        }).toThrow();
    });
});

/**
 * Manual Verification Checklist
 *
 * These automated tests cover the happy path and error handling,
 * but manual verification is recommended before production use:
 *
 * 1. Ensure gpg is installed on production server: apt-get install gnupg
 * 2. Generate strong passphrase: openssl rand -base64 32
 * 3. Add DB_BACKUP_PASSPHRASE to GitHub Secrets
 * 4. Test backup on staging environment:
 *    export DB_BACKUP_PASSPHRASE="your-passphrase"
 *    ./scripts/db-backup.sh
 * 5. Verify encrypted file is created: ls -lh /var/backups/matkassen/
 * 6. Test restore on staging database:
 *    ./scripts/db-restore.sh /var/backups/matkassen/backup.sql.gpg --force
 * 7. Verify application still works after restore
 * 8. Test passphrase rotation procedure (see deployment guide)
 * 9. Document restore procedure in runbook
 * 10. Test restore drill every 6 months (GDPR compliance)
 */
