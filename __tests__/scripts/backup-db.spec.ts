import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Tests for the deployed encrypted backup pipeline (scripts/backup-db.sh)
 * and the encrypted-only restore wrapper (scripts/backup-restore.sh).
 *
 * The backup script chains pg_dump → gpg → rclone → swift, none of which
 * are present in CI. We stub each with a tiny shell script on PATH so the
 * pipeline runs end-to-end against a local "fake Swift" directory. The
 * encryption step is real — we then independently decrypt the produced
 * file with the same passphrase to prove the ciphertext round-trips.
 */

const hasGpg = (() => {
    try {
        execFileSync("which", ["gpg"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

// Skip the whole suite (visible in the reporter) when gpg is unavailable,
// rather than silently returning from each test. If CI loses gpg for any
// reason, the suite count drops and the skip is obvious — previously a
// missing gpg just made the suite trivially green.
describe.skipIf(!hasGpg)("Encrypted database backup pipeline", () => {
    const testRoot = path.join(os.tmpdir(), `backup-db-test-${Date.now()}`);
    const mockBin = path.join(testRoot, "bin");
    const fakeRemote = path.join(testRoot, "swift");
    const backupScript = path.join(process.cwd(), "scripts/backup-db.sh");
    const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");
    const passphrase = "test-passphrase-only-used-in-vitest-suite-32chars";
    const mockDumpPayload = "MOCK_PG_DUMP_PAYLOAD_FOR_VITEST_SUITE";

    beforeAll(() => {
        fs.mkdirSync(mockBin, { recursive: true });
        fs.mkdirSync(fakeRemote, { recursive: true });

        // Stub pg_dump: emit a fixed payload to stdout.
        fs.writeFileSync(
            path.join(mockBin, "pg_dump"),
            `#!/bin/bash\nprintf '%s' '${mockDumpPayload}'\n`,
        );

        // Stub pg_restore: --list mode prints >10 TOC-looking lines so the
        // validation content-line check passes; everything else is a no-op.
        fs.writeFileSync(
            path.join(mockBin, "pg_restore"),
            `#!/bin/bash
if [ "$1" = "--list" ]; then
    cat <<'EOF'
;
; Archive created at 2026-04-14
; dbname: matkassen
;
1; 0 0 ENCODING - ENCODING
2; 0 0 STDSTRINGS - STDSTRINGS
3; 0 0 SEARCHPATH - SEARCHPATH
4; 200 1259 TABLE public households matkassen
5; 200 1259 TABLE public food_parcels matkassen
6; 200 1259 TABLE public users matkassen
7; 200 1259 TABLE public pets matkassen
8; 200 1259 TABLE public pickup_locations matkassen
9; 200 1259 TABLE public household_members matkassen
10; 200 1259 TABLE public sessions matkassen
11; 200 1259 TABLE public accounts matkassen
12; 200 1259 TABLE public verification_tokens matkassen
EOF
    exit 0
fi
cat >/dev/null
exit 0
`,
        );

        // Stub rclone: copy/copyto write into the fake remote dir; lsf and
        // size emit deterministic output for the script's status summary.
        fs.writeFileSync(
            path.join(mockBin, "rclone"),
            `#!/bin/bash
case "$1" in
    version)
        echo "rclone v0.0.0-mock"
        ;;
    copy)
        # rclone copy <src> <remote-spec>. Strip our flags.
        SRC="$2"
        cp "$SRC" "${fakeRemote}/$(basename "$SRC")"
        ;;
    copyto)
        # rclone copyto <remote-spec> <dest>.
        SRC_NAME=$(basename "$2")
        cp "${fakeRemote}/$SRC_NAME" "$3"
        ;;
    about)
        echo "Total: 1 GiB"
        ;;
    lsf)
        ls "${fakeRemote}" 2>/dev/null | grep -E 'matkassen_backup_.*\\.dump\\.gpg$' || true
        ;;
    size)
        echo "Total objects: 1"
        echo "Total size: 1.0 KiB"
        ;;
    *)
        ;;
esac
exit 0
`,
        );

        // Stub swift: X-Delete-After header set is a no-op.
        fs.writeFileSync(path.join(mockBin, "swift"), "#!/bin/bash\nexit 0\n");

        // Stub curl: record the last --data payload to CURL_LOG so tests
        // can assert a Slack notification was attempted.
        fs.writeFileSync(
            path.join(mockBin, "curl"),
            `#!/bin/bash
while [ $# -gt 0 ]; do
    if [ "$1" = "--data" ]; then
        shift
        if [ -n "\${CURL_LOG:-}" ]; then printf '%s\\n' "$1" >> "$CURL_LOG"; fi
    fi
    shift
done
echo '{"ok":true}'
exit 0
`,
        );

        for (const exe of ["pg_dump", "pg_restore", "rclone", "swift", "curl"]) {
            fs.chmodSync(path.join(mockBin, exe), 0o755);
        }
    });

    afterAll(() => {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    });

    function runBackup(extraEnv: Record<string, string> = {}): {
        stdout: string;
        stderr: string;
    } {
        try {
            const result = execFileSync(backupScript, [], {
                env: {
                    ...process.env,
                    PATH: `${mockBin}:${process.env.PATH}`,
                    DB_BACKUP_PASSPHRASE: passphrase,
                    POSTGRES_HOST: "db",
                    POSTGRES_USER: "matkassen",
                    POSTGRES_DB: "matkassen",
                    POSTGRES_PASSWORD: "test-pw",
                    SWIFT_CONTAINER: "test-container",
                    SWIFT_PREFIX: "backups",
                    BACKUP_RETENTION_DAYS: "14",
                    ...extraEnv,
                },
                stdio: "pipe",
                encoding: "utf-8",
            });
            return { stdout: result, stderr: "" };
        } catch (e: any) {
            return { stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "" };
        }
    }

    it("aborts when DB_BACKUP_PASSPHRASE is missing", () => {
        const env = { ...process.env, PATH: `${mockBin}:${process.env.PATH}` };
        delete (env as any).DB_BACKUP_PASSPHRASE;

        let exitCode = 0;
        try {
            execFileSync(backupScript, [], {
                env: {
                    ...env,
                    POSTGRES_HOST: "db",
                    POSTGRES_USER: "matkassen",
                    POSTGRES_DB: "matkassen",
                    POSTGRES_PASSWORD: "test-pw",
                    SWIFT_CONTAINER: "test-container",
                },
                stdio: "pipe",
            });
        } catch (e: any) {
            exitCode = e.status ?? 1;
        }
        expect(exitCode).not.toBe(0);
    });

    it("encrypts the dump, uploads to Swift, and validates the round-trip", () => {
        // Clean fake remote between tests
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }

        const { stdout } = runBackup();

        expect(stdout).toContain("Backup process completed successfully");
        expect(stdout).toContain("Backup validation OK");

        const uploaded = fs
            .readdirSync(fakeRemote)
            .filter(f => /^matkassen_backup_\d+_\d+\.dump\.gpg$/.test(f));
        expect(uploaded.length).toBe(1);

        // Ciphertext on the remote must not contain the plaintext payload
        const cipherBytes = fs.readFileSync(path.join(fakeRemote, uploaded[0]));
        expect(cipherBytes.includes(Buffer.from(mockDumpPayload))).toBe(false);

        // Independent decrypt with the same passphrase recovers the plaintext.
        // This is the property the production restore depends on.
        const recoveredPath = path.join(testRoot, "recovered.bin");
        try {
            execFileSync(
                "gpg",
                [
                    "--decrypt",
                    "--batch",
                    "--quiet",
                    "--passphrase-fd",
                    "0",
                    "--pinentry-mode",
                    "loopback",
                    "--output",
                    recoveredPath,
                    path.join(fakeRemote, uploaded[0]),
                ],
                { input: passphrase, stdio: ["pipe", "pipe", "pipe"] },
            );
        } catch (e: any) {
            throw new Error(`gpg decrypt failed: ${e.stderr?.toString()}`);
        }
        const recovered = fs.readFileSync(recoveredPath, "utf-8");
        expect(recovered).toBe(mockDumpPayload);
        fs.rmSync(recoveredPath);
    });

    it("decryption fails with the wrong passphrase", () => {
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        runBackup();
        const uploaded = fs.readdirSync(fakeRemote).filter(f => /\.dump\.gpg$/.test(f))[0];

        let failed = false;
        try {
            execFileSync(
                "gpg",
                [
                    "--decrypt",
                    "--batch",
                    "--quiet",
                    "--passphrase-fd",
                    "0",
                    "--pinentry-mode",
                    "loopback",
                    path.join(fakeRemote, uploaded),
                ],
                { input: "wrong-passphrase", stdio: ["pipe", "pipe", "pipe"] },
            );
        } catch {
            failed = true;
        }
        expect(failed).toBe(true);
    });

    it("notifies Slack when pg_dump fails mid-pipeline", () => {
        // Regression test for the silent-failure bug: set -e previously
        // killed the script on pg_dump/gpg/rclone failure without ever
        // calling notify_slack. The ERR trap must now pick up those cases.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        // Swap pg_dump with a stub that fails
        const realPgDump = fs.readFileSync(path.join(mockBin, "pg_dump"), "utf-8");
        fs.writeFileSync(
            path.join(mockBin, "pg_dump"),
            `#!/bin/bash\necho "simulated pg_dump failure" >&2\nexit 42\n`,
        );
        fs.chmodSync(path.join(mockBin, "pg_dump"), 0o755);

        const curlLog = path.join(testRoot, "curl.log");
        fs.writeFileSync(curlLog, "");

        const { stdout } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
        });

        // Restore the working pg_dump stub for later tests
        fs.writeFileSync(path.join(mockBin, "pg_dump"), realPgDump);
        fs.chmodSync(path.join(mockBin, "pg_dump"), 0o755);

        const notifications = fs.readFileSync(curlLog, "utf-8");
        expect(stdout).toMatch(/Backup aborted in stage '?pg_dump\|gpg/);
        expect(notifications).toContain("pg_dump|gpg");
        expect(notifications).toMatch(/"text":\s*"\[matkassen\]/);
    });

    it("notifies Slack when rclone upload fails", () => {
        // The ERR trap also has to catch rclone failures, not just pg_dump.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        const realRclone = fs.readFileSync(path.join(mockBin, "rclone"), "utf-8");
        // Override just the 'copy' verb with a failure; keep the rest working.
        fs.writeFileSync(
            path.join(mockBin, "rclone"),
            `#!/bin/bash
if [ "$1" = "copy" ]; then
    echo "simulated rclone upload failure" >&2
    exit 7
fi
${realRclone.replace(/^#!\/bin\/bash\n/, "")}`,
        );
        fs.chmodSync(path.join(mockBin, "rclone"), 0o755);

        const curlLog = path.join(testRoot, "curl.log");
        fs.writeFileSync(curlLog, "");

        const { stdout } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
        });

        fs.writeFileSync(path.join(mockBin, "rclone"), realRclone);
        fs.chmodSync(path.join(mockBin, "rclone"), 0o755);

        const notifications = fs.readFileSync(curlLog, "utf-8");
        expect(stdout).toMatch(/Backup aborted in stage '?rclone upload/);
        expect(notifications).toContain("rclone upload");
    });

    it("fails validation when the sentinel 'households' table is missing", () => {
        // The sentinel check protects against a corrupted or truncated dump
        // that's still technically parseable by `pg_restore --list`. Stub
        // it to return a TOC that omits the households entry and confirm
        // validation reports failure.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        const realPgRestore = fs.readFileSync(path.join(mockBin, "pg_restore"), "utf-8");
        fs.writeFileSync(
            path.join(mockBin, "pg_restore"),
            `#!/bin/bash
if [ "$1" = "--list" ]; then
    cat <<'EOF'
;
; Archive created at 2026-04-14
; dbname: matkassen
;
1; 0 0 ENCODING - ENCODING
2; 0 0 STDSTRINGS - STDSTRINGS
3; 0 0 SEARCHPATH - SEARCHPATH
4; 200 1259 TABLE public some_other_table matkassen
EOF
    exit 0
fi
cat >/dev/null
exit 0
`,
        );
        fs.chmodSync(path.join(mockBin, "pg_restore"), 0o755);

        const curlLog = path.join(testRoot, "curl.log");
        fs.writeFileSync(curlLog, "");

        const { stdout } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
        });

        fs.writeFileSync(path.join(mockBin, "pg_restore"), realPgRestore);
        fs.chmodSync(path.join(mockBin, "pg_restore"), 0o755);

        const notifications = fs.readFileSync(curlLog, "utf-8");
        expect(stdout).toContain("sentinel table 'households' is missing");
        // The script exits 1 on validation failure and the final Slack
        // alert is a "validation failed" message, not the generic ERR
        // trap — assert on that specific phrasing.
        expect(notifications).toContain("validation failed");
    });
});

describe("Restore script argument handling", () => {
    it("rejects filenames that don't end in .dump.gpg", () => {
        const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");
        let exitCode = 0;
        let stderr = "";
        try {
            execFileSync(restoreScript, ["matkassen_backup_20250101_020000.dump"], {
                env: {
                    ...process.env,
                    ENV_NAME: "production",
                    DB_BACKUP_PASSPHRASE: "anything",
                    SWIFT_CONTAINER: "x",
                },
                stdio: "pipe",
            });
        } catch (e: any) {
            exitCode = e.status ?? 1;
            stderr = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toMatch(/must end in \.dump\.gpg/);
    });

    it("refuses to run outside ENV_NAME=production", () => {
        const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");
        let exitCode = 0;
        let stderr = "";
        try {
            execFileSync(restoreScript, ["matkassen_backup_20250101_020000.dump.gpg"], {
                env: {
                    ...process.env,
                    ENV_NAME: "staging",
                    DB_BACKUP_PASSPHRASE: "anything",
                    SWIFT_CONTAINER: "x",
                },
                stdio: "pipe",
            });
        } catch (e: any) {
            exitCode = e.status ?? 1;
            stderr = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toMatch(/ENV_NAME=production/);
    });
});

describe("Restore script POSTGRES_DB forwarding", () => {
    // Regression test for the High-severity bug: passing -e POSTGRES_DB=""
    // clobbered the backup container's own POSTGRES_DB with an empty
    // string when the operator hadn't exported it locally. The fix only
    // forwards -e POSTGRES_DB when set. We verify that by stubbing
    // `docker` on PATH to record its invocation argv.
    const testRoot = path.join(os.tmpdir(), `backup-restore-test-${Date.now()}`);
    const mockBin = path.join(testRoot, "bin");
    const dockerLog = path.join(testRoot, "docker.log");
    const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");

    beforeAll(() => {
        fs.mkdirSync(mockBin, { recursive: true });
        // Stub `docker`: print each argv line to DOCKER_LOG and exit 0.
        // The restore script calls `docker compose version` first (passes
        // through as success) and then `docker compose ... exec ...` which
        // we need to capture. We serialise argv per call on one line so
        // the test can grep for the exec line specifically.
        fs.writeFileSync(
            path.join(mockBin, "docker"),
            `#!/bin/bash
printf '%s\\n' "docker $*" >> "\${DOCKER_LOG:-/dev/null}"
# docker compose version — succeed quietly so the wrapper-detection path
# in backup-restore.sh is a no-op.
if [ "\${1:-}" = "compose" ] && [ "\${2:-}" = "version" ]; then
    echo "Docker Compose version v2.stub"
    exit 0
fi
# docker compose exec — just acknowledge success without doing anything.
exit 0
`,
        );
        fs.chmodSync(path.join(mockBin, "docker"), 0o755);
    });

    afterAll(() => {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    });

    function runRestore(extraEnv: Record<string, string> = {}): string {
        fs.writeFileSync(dockerLog, "");
        try {
            execFileSync(restoreScript, ["matkassen_backup_20260101_020000.dump.gpg"], {
                env: {
                    ...process.env,
                    PATH: `${mockBin}:${process.env.PATH}`,
                    ENV_NAME: "production",
                    DB_BACKUP_PASSPHRASE: "test-passphrase",
                    SWIFT_CONTAINER: "test",
                    DOCKER_LOG: dockerLog,
                    ...extraEnv,
                },
                stdio: "pipe",
                // "y\n" to the confirm prompt
                input: "y\n",
            });
        } catch {
            // docker stub exits 0 but the outer script may still fail for
            // other reasons in ancillary commands — we only care about the
            // recorded docker argv, which is written regardless.
        }
        return fs.readFileSync(dockerLog, "utf-8");
    }

    it("omits -e POSTGRES_DB when the caller has not exported it", () => {
        const log = runRestore();
        const execLine = log.split("\n").find(l => l.includes(" exec "));
        expect(execLine).toBeDefined();
        expect(execLine).toContain("-e BACKUP_FILENAME=");
        expect(execLine).not.toMatch(/-e POSTGRES_DB/);
    });

    it("forwards -e POSTGRES_DB when the caller has exported it", () => {
        const log = runRestore({ POSTGRES_DB: "matkassen_restore_drill" });
        const execLine = log.split("\n").find(l => l.includes(" exec "));
        expect(execLine).toBeDefined();
        expect(execLine).toContain("-e POSTGRES_DB=matkassen_restore_drill");
    });
});
