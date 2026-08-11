import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const updateSource = readFileSync(resolve(process.cwd(), "update.sh"), "utf8");
const deploySource = readFileSync(resolve(process.cwd(), "deploy.sh"), "utf8");
const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/continuous_deployment.yml"),
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
