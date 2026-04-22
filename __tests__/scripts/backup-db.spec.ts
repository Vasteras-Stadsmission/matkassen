import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Tests for the deployed encrypted backup pipeline (scripts/backup-db.sh)
 * and the encrypted-only restore wrapper (scripts/backup-restore.sh).
 *
 * The backup script chains pg_dump → gpg → rclone → swift → createdb →
 * pg_restore → psql → dropdb, none of which are present in CI. We stub
 * each with a tiny shell script on PATH so the pipeline runs end-to-end
 * against a local "fake Swift" directory. The encryption step is real
 * — we then independently decrypt the produced file with the same
 * passphrase to prove the ciphertext round-trips.
 *
 * SCOPE: this suite is intentionally shell/control-flow coverage only.
 * It verifies that the script invokes the right binaries with the right
 * flags in the right order, that failure paths set the right exit code,
 * and that Slack notifications fire. It does NOT exercise real Postgres
 * semantics — a pg_restore stub that `cat >/dev/null` and exits 0 will
 * pass even if pg_restore had missing --exit-on-error, bad flag combos,
 * or ownership/extension issues. Real-binary verification is done via
 * the local E2E drill (docker build + docker run against a local dev
 * DB, see the commit message of commit b2ebf7e) and by the first prod
 * nightly run after deploy. Run the local drill before meaningful
 * script changes land.
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

        // Stub pg_restore: consume stdin (the streamed dump), record the
        // target DB AND all flags for test assertions. Configurable
        // failure via FAIL_PG_RESTORE env var.
        fs.writeFileSync(
            path.join(mockBin, "pg_restore"),
            `#!/bin/bash
TARGET_DB=""
FLAGS=""
while [ $# -gt 0 ]; do
    if [ "$1" = "-d" ]; then shift; TARGET_DB="$1"
    elif [[ "$1" == --* ]]; then FLAGS="$FLAGS $1"
    fi
    shift
done
printf 'pg_restore -d %s flags=%s\\n' "$TARGET_DB" "$FLAGS" >> "\${DB_OPS_LOG:-/dev/null}"
cat >/dev/null
if [ -n "\${FAIL_PG_RESTORE:-}" ]; then
    echo "simulated pg_restore failure" >&2
    exit 1
fi
exit 0
`,
        );

        // Stub createdb / dropdb: record invocation, exit 0 by default.
        // Failure paths configurable via FAIL_CREATEDB / FAIL_DROPDB.
        fs.writeFileSync(
            path.join(mockBin, "createdb"),
            `#!/bin/bash
DB_NAME="\${!#}"
printf 'createdb %s\\n' "$DB_NAME" >> "\${DB_OPS_LOG:-/dev/null}"
if [ -n "\${FAIL_CREATEDB:-}" ]; then
    echo "simulated createdb failure" >&2
    exit 1
fi
exit 0
`,
        );
        fs.writeFileSync(
            path.join(mockBin, "dropdb"),
            `#!/bin/bash
DB_NAME="\${!#}"
printf 'dropdb %s\\n' "$DB_NAME" >> "\${DB_OPS_LOG:-/dev/null}"
exit 0
`,
        );

        // Stub psql: for the sentinel query (-tAc "SELECT to_regclass..."),
        // print SENTINEL_RESULT (default "t" = table exists). For any
        // other invocation, just exit 0. Record the target DB.
        fs.writeFileSync(
            path.join(mockBin, "psql"),
            `#!/bin/bash
TARGET_DB=""
QUERY=""
NEXT_IS_DB=0
NEXT_IS_QUERY=0
for arg in "$@"; do
    if [ "$NEXT_IS_DB" = "1" ]; then TARGET_DB="$arg"; NEXT_IS_DB=0; continue; fi
    if [ "$NEXT_IS_QUERY" = "1" ]; then QUERY="$arg"; NEXT_IS_QUERY=0; continue; fi
    case "$arg" in
        -d) NEXT_IS_DB=1 ;;
        -c|-tAc) NEXT_IS_QUERY=1 ;;
    esac
done
printf 'psql -d %s\\n' "$TARGET_DB" >> "\${DB_OPS_LOG:-/dev/null}"
if [[ "$QUERY" == *"to_regclass"* ]]; then
    echo "\${SENTINEL_RESULT:-t}"
fi
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

        for (const exe of [
            "pg_dump",
            "pg_restore",
            "createdb",
            "dropdb",
            "psql",
            "rclone",
            "swift",
            "curl",
        ]) {
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
        status: number;
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
            return { stdout: result, stderr: "", status: 0 };
        } catch (e: any) {
            return {
                stdout: e.stdout?.toString() ?? "",
                stderr: e.stderr?.toString() ?? "",
                status: e.status ?? 1,
            };
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

    it("encrypts the dump, uploads to Swift, and validates via full restore", () => {
        // Clean fake remote between tests
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }

        const opsLog = path.join(testRoot, "db-ops.log");
        fs.writeFileSync(opsLog, "");
        const { stdout, status } = runBackup({ DB_OPS_LOG: opsLog });

        expect(status).toBe(0);
        expect(stdout).toContain("Backup process completed successfully");
        expect(stdout).toContain("Validation OK - full restore succeeded");

        // Verify the DB ops happened in the right order: pre-flight dropdb,
        // then createdb, then pg_restore into the scratch DB, then sentinel
        // psql, then post-run dropdb. All must target the fixed scratch
        // name, never $POSTGRES_DB (= "matkassen" in this test).
        const ops = fs.readFileSync(opsLog, "utf-8").trim().split("\n");
        expect(ops[0]).toBe("dropdb matkassen_nightly_validate"); // pre-flight
        expect(ops).toContain("createdb matkassen_nightly_validate");
        const pgRestoreLine = ops.find(l =>
            l.startsWith("pg_restore -d matkassen_nightly_validate"),
        );
        expect(pgRestoreLine).toBeDefined();
        // Regression guard for H2: --exit-on-error must be on the pg_restore
        // call so a partial restore fails fast instead of limping on.
        expect(pgRestoreLine).toContain("--exit-on-error");
        expect(ops).toContain("psql -d matkassen_nightly_validate");
        // Post-run cleanup must also be against the scratch name only.
        expect(ops[ops.length - 1]).toBe("dropdb matkassen_nightly_validate");
        // Sanity: nothing in the ops log should reference the real DB name.
        expect(ops.every(line => !line.endsWith(" matkassen"))).toBe(true);

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

        const { stdout, status } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
        });

        // Restore the working pg_dump stub for later tests
        fs.writeFileSync(path.join(mockBin, "pg_dump"), realPgDump);
        fs.chmodSync(path.join(mockBin, "pg_dump"), 0o755);

        const notifications = fs.readFileSync(curlLog, "utf-8");
        expect(status).not.toBe(0);
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

        const { stdout, status } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
        });

        fs.writeFileSync(path.join(mockBin, "rclone"), realRclone);
        fs.chmodSync(path.join(mockBin, "rclone"), 0o755);

        const notifications = fs.readFileSync(curlLog, "utf-8");
        expect(status).not.toBe(0);
        expect(stdout).toMatch(/Backup aborted in stage '?rclone upload/);
        expect(notifications).toContain("rclone upload");
    });

    it("fails validation when the sentinel query returns 'f' (table missing)", () => {
        // After full restore, the script runs
        // `SELECT to_regclass('public.households') IS NOT NULL`.
        // If that returns 'f', the table didn't survive the restore →
        // the backup is unreliable and validation must fail.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        const curlLog = path.join(testRoot, "curl.log");
        fs.writeFileSync(curlLog, "");

        const { stdout, status } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
            SENTINEL_RESULT: "f",
        });

        const notifications = fs.readFileSync(curlLog, "utf-8");
        expect(status).not.toBe(0);
        expect(stdout).toContain("sentinel query returned 'f'");
        expect(notifications).toContain("validation failed");
    });

    it("drops the scratch DB even when pg_restore fails", () => {
        // Regression test for the cleanup contract: a failed full-restore
        // must not leak the scratch DB. The EXIT trap has to run dropdb
        // regardless of whether validation succeeded.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        const opsLog = path.join(testRoot, "db-ops.log");
        const curlLog = path.join(testRoot, "curl.log");
        fs.writeFileSync(opsLog, "");
        fs.writeFileSync(curlLog, "");

        const { stdout, status } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
            DB_OPS_LOG: opsLog,
            FAIL_PG_RESTORE: "1",
        });

        expect(status).not.toBe(0);
        const ops = fs.readFileSync(opsLog, "utf-8").trim().split("\n");
        // createdb fired, pg_restore ran (and failed), dropdb still fired
        // at the end. Exactly one post-run dropdb, plus the pre-flight
        // one, = two dropdb calls in total.
        expect(ops.filter(l => l === "createdb matkassen_nightly_validate")).toHaveLength(1);
        expect(
            ops.filter(l => l.startsWith("pg_restore -d matkassen_nightly_validate")),
        ).toHaveLength(1);
        expect(ops.filter(l => l === "dropdb matkassen_nightly_validate")).toHaveLength(2);
        expect(stdout).toContain("pg_restore errored");
    });

    it("runs pre-flight dropdb before any createdb", () => {
        // If a previous run crashed mid-validation, the scratch DB may
        // still exist. Pre-flight must drop it so createdb can succeed.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        const opsLog = path.join(testRoot, "db-ops.log");
        fs.writeFileSync(opsLog, "");

        runBackup({ DB_OPS_LOG: opsLog });

        const ops = fs.readFileSync(opsLog, "utf-8").trim().split("\n");
        const firstCreate = ops.indexOf("createdb matkassen_nightly_validate");
        const firstDrop = ops.indexOf("dropdb matkassen_nightly_validate");
        expect(firstDrop).toBeGreaterThanOrEqual(0);
        expect(firstCreate).toBeGreaterThan(firstDrop);
    });

    it("alerts Slack when createdb fails (missing CREATEDB grant)", () => {
        // The most operationally likely failure: rollout skipped the
        // ALTER USER ... CREATEDB step. The script should fail the run
        // with a clear hint rather than hanging or silently succeeding.
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        const curlLog = path.join(testRoot, "curl.log");
        fs.writeFileSync(curlLog, "");

        const { stdout, status } = runBackup({
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_CHANNEL_ID: "C_TEST",
            CURL_LOG: curlLog,
            FAIL_CREATEDB: "1",
        });

        expect(status).not.toBe(0);
        expect(stdout).toContain("could not create scratch DB");
        expect(stdout).toContain("CREATEDB");
        const notifications = fs.readFileSync(curlLog, "utf-8");
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
