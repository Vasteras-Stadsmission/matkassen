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
    return <AccessDeniedContent reason={reason} />;
}
