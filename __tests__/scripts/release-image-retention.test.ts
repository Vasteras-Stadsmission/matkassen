import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Behavior tests for scripts/release-image-retention.sh, which update.sh
 * sources to bound the number of release images kept on the VPS.
 *
 * `sudo` and `docker` are replaced by stubs on PATH. The docker stub answers
 * the handful of queries the helper makes from two TSV fixtures and records
 * every `docker image rm` so the tests can assert exactly what was removed.
 */

const helper = path.join(process.cwd(), "scripts/release-image-retention.sh");
const APP = "ghcr.io/vasteras-stadsmission/matkassen";
const BACKUP = "ghcr.io/vasteras-stadsmission/matkassen-db-backup";

const dockerStub = `#!/bin/bash
set -euo pipefail
F="$FAKE_DOCKER_DIR"
echo "$*" >> "$F/calls.log"
case "$1 $2" in
    "ps -aq")
        [ ! -f "$F/fail-ps" ] || exit 1
        cut -f1 "$F/containers.tsv"
        ;;
    "inspect --format")
        [ ! -f "$F/fail-inspect" ] || exit 1
        shift 3
        for c in "$@"; do
            awk -F'\\t' -v c="$c" '$1 == c { print $2 }' "$F/containers.tsv"
        done
        ;;
    "image ls")
        repo="\${!#}"
        awk -F'\\t' -v r="$repo" '$1 == r { print $2 "\\t" $3 }' "$F/images.tsv"
        ;;
    "image inspect")
        ref="\${!#}"
        awk -F'\\t' -v ref="$ref" '$1 ":" $2 == ref { print $4 "|" $5 }' "$F/images.tsv"
        ;;
    "image rm")
        if grep -qxF "$3" "$F/rm-fail" 2>/dev/null; then
            echo "conflict: unable to remove $3" >&2
            exit 1
        fi
        echo "$3" >> "$F/removed.log"
        echo "Untagged: $3"
        ;;
    *)
        echo "unexpected docker call: $*" >&2
        exit 99
        ;;
esac
`;

type Image = { repo: string; tag: string; id: string; label?: string; created: string };

describe("prune_release_images", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-image-retention-"));
        fs.mkdirSync(path.join(dir, "bin"));
        fs.writeFileSync(path.join(dir, "bin/sudo"), '#!/bin/bash\nexec "$@"\n', { mode: 0o755 });
        fs.writeFileSync(path.join(dir, "bin/docker"), dockerStub, { mode: 0o755 });
        fs.writeFileSync(path.join(dir, "containers.tsv"), "");
        fs.writeFileSync(path.join(dir, "images.tsv"), "");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const setImages = (images: Image[]) =>
        fs.writeFileSync(
            path.join(dir, "images.tsv"),
            images.map(i => [i.repo, i.tag, i.id, i.label ?? "", i.created].join("\t")).join("\n") +
                "\n",
        );

    const setContainers = (containers: Array<[string, string]>) =>
        fs.writeFileSync(
            path.join(dir, "containers.tsv"),
            containers.map(c => c.join("\t")).join("\n") + "\n",
        );

    const run = (repo: string, keep: number, protectedIds: string[] = []) =>
        execFileSync(
            "bash",
            [
                "-c",
                'set -Eeuo pipefail; source "$HELPER"; prune_release_images "$REPO" "$KEEP" "$@"',
                "bash",
                ...protectedIds,
            ],
            {
                encoding: "utf8",
                env: {
                    ...process.env,
                    PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
                    FAKE_DOCKER_DIR: dir,
                    HELPER: helper,
                    REPO: repo,
                    KEEP: String(keep),
                },
            },
        );

    const removed = () => {
        const log = path.join(dir, "removed.log");
        return fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
    };

    const release = (n: number, overrides: Partial<Image> = {}): Image => ({
        repo: APP,
        tag: `sha-${String(n).repeat(40).slice(0, 40)}`,
        id: `sha256:${String(n).repeat(64).slice(0, 64)}`,
        label: `2026-09-0${n}T12:00:00.000Z`,
        created: `2026-09-0${n}T11:58:00.000000000Z`,
        ...overrides,
    });

    it("keeps the newest releases and removes older unused ones", () => {
        setImages([1, 2, 3, 4, 5].map(n => release(n)));
        setContainers([["web", release(5).id]]);

        const output = run(APP, 3);

        expect(removed().sort()).toEqual([`${APP}:${release(1).tag}`, `${APP}:${release(2).tag}`]);
        expect(output).toContain("removed 2, failed 0");
    });

    it("orders by the OCI created label, not the cache-affected image timestamp", () => {
        // Release 3 was a full GHA cache hit: its .Created is older than the
        // previous releases even though it was built and deployed last.
        setImages([
            release(1),
            release(2),
            release(3, { created: "2026-08-01T00:00:00.000000000Z" }),
        ]);

        run(APP, 2);

        expect(removed()).toEqual([`${APP}:${release(1).tag}`]);
    });

    it("falls back to the image timestamp when the label is missing", () => {
        setImages([
            { repo: "postgres", tag: "17.9", id: "sha256:a", created: "2026-05-01T00:00:00Z" },
            { repo: "postgres", tag: "17.11", id: "sha256:c", created: "2026-09-01T00:00:00Z" },
            { repo: "postgres", tag: "17.10", id: "sha256:b", created: "2026-08-01T00:00:00Z" },
        ]);

        run("postgres", 2);

        expect(removed()).toEqual(["postgres:17.9"]);
    });

    it("never removes an image that a container still uses", () => {
        // A container still runs release 1, for example after a manual rollback.
        setImages([1, 2, 3, 4, 5].map(n => release(n)));
        setContainers([
            ["web", release(1).id],
            ["stopped-one-off", release(2).id],
        ]);

        const output = run(APP, 2);

        expect(removed()).toEqual([`${APP}:${release(3).tag}`]);
        expect(output).toContain(`Keeping ${APP}:${release(1).tag} (used by a container)`);
    });

    it("keeps an explicitly protected release when failed candidates fill the window", () => {
        // Release 3 ran before this deploy; releases 4 and 5 were pulled after
        // it, and only 5 is running now.
        setImages([1, 2, 3, 4, 5].map(n => release(n)));
        setContainers([["web", release(5).id]]);

        const output = run(APP, 2, [release(3).id]);

        expect(removed().sort()).toEqual([`${APP}:${release(1).tag}`, `${APP}:${release(2).tag}`]);
        expect(output).toContain(
            `Keeping ${APP}:${release(3).tag} (release that was running before this deploy)`,
        );
    });

    it("only touches the requested repository", () => {
        setImages([
            ...[1, 2, 3].map(n => release(n)),
            ...[1, 2, 3].map(n => release(n, { repo: BACKUP, id: `sha256:backup${n}` })),
        ]);

        run(BACKUP, 1);

        expect(removed().sort()).toEqual([
            `${BACKUP}:${release(1).tag}`,
            `${BACKUP}:${release(2).tag}`,
        ]);
    });

    it("counts several tags of one image as a single release", () => {
        setImages([release(1), release(2), release(3), release(3, { tag: "latest" })]);

        run(APP, 2);

        expect(removed()).toEqual([`${APP}:${release(1).tag}`]);
    });

    it("reports a failed removal without failing the deploy", () => {
        setImages([1, 2, 3].map(n => release(n)));
        fs.writeFileSync(path.join(dir, "rm-fail"), `${APP}:${release(1).tag}\n`);

        const output = run(APP, 1);

        expect(removed()).toEqual([`${APP}:${release(2).tag}`]);
        expect(output).toContain(`Could not remove ${APP}:${release(1).tag}`);
        expect(output).toContain("removed 1, failed 1");
    });

    it("removes nothing when the images in use cannot be determined", () => {
        setImages([1, 2, 3].map(n => release(n)));
        setContainers([["web", release(3).id]]);
        fs.writeFileSync(path.join(dir, "fail-inspect"), "");

        const output = run(APP, 1);

        expect(removed()).toEqual([]);
        expect(output).toContain("skipping retention");
    });

    it("never force-removes images", () => {
        setImages([1, 2, 3].map(n => release(n)));

        run(APP, 1);

        const calls = fs.readFileSync(path.join(dir, "calls.log"), "utf8");
        expect(calls).toContain("image rm");
        expect(calls).not.toMatch(/image rm[^\n]*(?:-f|--force)/);
        expect(calls).not.toMatch(/prune/);
    });

    it("rejects an invalid keep count", () => {
        expect(() => run(APP, 0)).toThrow();
    });
});
