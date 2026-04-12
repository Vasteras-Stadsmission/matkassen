import AccessDeniedContent from "./AccessDeniedContent";

type SearchParams = {
    reason?: string;
};

export default async function AccessDeniedPage({
    searchParams,
}: {
    searchParams: SearchParams | Promise<SearchParams>;
}) {
    const { reason } = await searchParams;
    const organization = process.env.GITHUB_ORG || undefined;
    return <AccessDeniedContent reason={reason} organization={organization} />;
}
