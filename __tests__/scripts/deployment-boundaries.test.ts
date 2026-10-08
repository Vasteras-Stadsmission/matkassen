import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const updateSource = readFileSync(resolve(process.cwd(), "update.sh"), "utf8");
const deploySource = readFileSync(resolve(process.cwd(), "deploy.sh"), "utf8");
const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/continuous_deployment.yml"),
    "utf8",
);
const postgresScriptSource = readFileSync(
    resolve(process.cwd(), "scripts/postgres-image-update.sh"),
    "utf8",
);
const postgresWorkflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/postgres_image_update.yml"),
    "utf8",
);

describe("routine deployment boundaries", () => {
    it("replaces only application services without Compose dependencies", () => {
        expect(updateSource).toContain(
            "docker compose up -d --no-deps --wait --wait-timeout 300 web",
        );
        expect(updateSource).toContain(
            '"${BACKUP_COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 300 db-backup',
        );
        expect(updateSource).not.toMatch(/docker compose up[^\n]*\sdb(?:\s|$)/);
    });

    it("pulls all candidate images before migrations and web replacement", () => {
        const webPullIndex = updateSource.indexOf("docker compose pull web");
        const backupPullIndex = updateSource.indexOf('"${BACKUP_COMPOSE[@]}" pull db-backup');
        const migrationIndex = updateSource.indexOf(
            "docker compose run --rm --no-deps -T web pnpm run db:migrate",
        );
        const replacementIndex = updateSource.indexOf(
            "docker compose up -d --no-deps --wait --wait-timeout 300 web",
        );

        expect(webPullIndex).toBeGreaterThan(-1);
        expect(backupPullIndex).toBeGreaterThan(-1);
        expect(migrationIndex).toBeGreaterThan(webPullIndex);
        expect(migrationIndex).toBeGreaterThan(backupPullIndex);
        expect(replacementIndex).toBeGreaterThan(migrationIndex);
    });

    it("derives both immutable image tags only from the deployment SHA", () => {
        expect(updateSource).toContain('export APP_IMAGE_TAG="sha-$DEPLOY_SHA"');
        expect(updateSource).toContain('export DB_BACKUP_IMAGE_TAG="sha-$DEPLOY_SHA"');
        expect(updateSource).not.toContain("${APP_IMAGE_TAG:-");
        expect(updateSource).not.toContain("${DB_BACKUP_IMAGE_TAG:-");
    });

    it("checks image identity and preserves the PostgreSQL container", () => {
        expect(updateSource).toContain("org.opencontainers.image.revision");
        expect(updateSource).toContain("DB_CONTAINER_BEFORE");
        expect(updateSource).toContain("DB_CONTAINER_AFTER");
        expect(updateSource).toContain("DB_RESTARTS_BEFORE");
        expect(updateSource).toContain("DB_RESTARTS_AFTER");
        expect(updateSource).toContain(
            'if [ "$DB_CONTAINER_AFTER" != "$DB_CONTAINER_BEFORE" ]; then',
        );
    });

    it("does not reconfigure the host or broadly prune rollback images", () => {
        expect(updateSource).not.toContain("generate-nginx-config.sh");
        expect(updateSource).not.toContain("configure-journald.sh");
        expect(updateSource).not.toContain("apt-get");
        expect(updateSource).not.toContain("ALTER USER");
        expect(updateSource).not.toContain("deployment-safety");
        expect(updateSource).not.toMatch(/docker (?:system|image) prune[^\n]*-a/);
        expect(deploySource).not.toMatch(/docker (?:system|image) prune[^\n]*-a/);
    });

    it("bounds release images before the free-space check and after the deploy", () => {
        const cleanupCalls = [...updateSource.matchAll(/^cleanup_docker_resources$/gm)].map(
            m => m.index,
        );
        const freeSpaceIndex = updateSource.indexOf("df -Pk / | awk");
        const dbHealthIndex = updateSource.indexOf(
            "DB_CONTAINER_BEFORE=$(sudo docker compose ps -q db)",
        );
        const pullIndex = updateSource.indexOf("docker compose pull web");
        const replacementIndex = updateSource.indexOf(
            "docker compose up -d --no-deps --wait --wait-timeout 300 web",
        );

        expect(updateSource).toContain('source "$APP_DIR/scripts/release-image-retention.sh"');
        expect(updateSource).toContain("RELEASE_IMAGES_TO_KEEP=3");
        expect(updateSource).toContain(
            'prune_release_images ghcr.io/vasteras-stadsmission/matkassen "$RELEASE_IMAGES_TO_KEEP" ${OUTGOING_WEB_IMAGE:+"$OUTGOING_WEB_IMAGE"}',
        );
        expect(updateSource).toContain(
            'prune_release_images ghcr.io/vasteras-stadsmission/matkassen-db-backup "$RELEASE_IMAGES_TO_KEEP" ${OUTGOING_BACKUP_IMAGE:+"$OUTGOING_BACKUP_IMAGE"}',
        );
        expect(updateSource).toContain(
            'docker container prune -f --filter "label!=com.docker.compose.service=db"',
        );
        expect(cleanupCalls).toHaveLength(2);
        expect(cleanupCalls[0]).toBeGreaterThan(dbHealthIndex);
        expect(freeSpaceIndex).toBeGreaterThan(cleanupCalls[0]!);
        expect(pullIndex).toBeGreaterThan(freeSpaceIndex);
        expect(cleanupCalls[1]).toBeGreaterThan(replacementIndex);
    });

    it("reports an unapplied PostgreSQL image instead of recreating PostgreSQL", () => {
        expect(updateSource).toContain("docker compose config --images db");
        expect(updateSource).toContain("::warning title=PostgreSQL image not applied::");
        expect(updateSource).not.toContain("postgres-image-update.sh");
        expect(workflowSource).not.toContain("postgres-image-update.sh");
    });

    it("treats initial public reachability checks as fatal", () => {
        expect(deploySource).toContain('check_url "https://$DOMAIN_NAME" "Website"');
        expect(deploySource).toContain(
            'check_url "https://$DOMAIN_NAME/api/health" "Health endpoint"',
        );
        expect(deploySource).not.toContain("Website should be functional.");
    });

    it("retries read-only public verification requests", () => {
        expect(workflowSource.match(/curl_read\(\)/g)).toHaveLength(2);
        expect(workflowSource.match(/--retry 2 --retry-delay 1 --retry-all-errors/g)).toHaveLength(
            2,
        );
    });
});

describe("PostgreSQL image update", () => {
    const indexOf = (text: string) => {
        const index = postgresScriptSource.indexOf(text);
        expect(index, text).toBeGreaterThan(-1);
        return index;
    };

    it("refuses major versions and other db changes before backup or downtime", () => {
        const majorCheck = indexOf("Refusing a major version change");
        const configHashCheck = indexOf("config --hash db");
        const storageCheck = indexOf('"$(configured_storage)" != "$RUNNING_STORAGE"');
        const backup = indexOf("exec -T db-backup /usr/local/bin/backup-db.sh");
        const rollbackTag = indexOf('sudo docker tag "$RUNNING_IMAGE_ID" "$ROLLBACK_IMAGE"');
        const recreate = indexOf(
            "docker compose up -d --no-deps --force-recreate --pull never \\\n    --wait --wait-timeout 240 --timeout 60 db",
        );

        expect(majorCheck).toBeLessThan(backup);
        expect(configHashCheck).toBeLessThan(backup);
        expect(storageCheck).toBeLessThan(backup);
        expect(backup).toBeLessThan(rollbackTag);
        expect(rollbackTag).toBeLessThan(recreate);
        expect(indexOf("RESTART_STARTED=1")).toBeLessThan(recreate);
    });

    it("shares the deployment lock and recreates nothing but db", () => {
        expect(postgresScriptSource).toContain(
            'LOCK_FILE="${LOCK_FILE:-/tmp/matkassen-deploy.lock}"',
        );
        expect(updateSource).toContain('LOCK_FILE="/tmp/matkassen-deploy.lock"');
        expect(postgresScriptSource.match(/docker compose up/g)).toHaveLength(1);
        expect(postgresScriptSource).toContain("docker compose up -d --no-deps --force-recreate");
        expect(postgresScriptSource).toContain("--wait --wait-timeout 240 --timeout 60 db; then");
        expect(postgresScriptSource).not.toMatch(/docker compose (?:down|restart|stop)/);
        expect(postgresScriptSource).not.toMatch(/docker (?:[a-z]+ )?prune/);
    });

    it("is a manual workflow that applies staging's tested digest to production after approval", () => {
        expect(postgresWorkflowSource).toMatch(/^on:\n {4}workflow_dispatch:\n\n/m);
        expect(postgresWorkflowSource).toContain("group: deploy-staging");
        expect(postgresWorkflowSource).toContain("group: deploy-production");
        expect(postgresWorkflowSource).toContain("needs: staging");
        expect(postgresWorkflowSource).toMatch(/environment:\n\s+name: production/);
        expect(postgresWorkflowSource).toContain(
            'export EXPECTED_DB_IMAGE_DIGEST="${{ needs.staging.outputs.digest }}"',
        );
        expect(postgresWorkflowSource.match(/cancel-in-progress: false/g)).toHaveLength(2);
        // The ssh-action default of 10 minutes is shorter than the backup limit.
        expect(postgresWorkflowSource).toContain("command_timeout: 60m");
    });
});
