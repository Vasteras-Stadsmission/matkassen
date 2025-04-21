import EditHouseholdClient from "./client";

export default async function EditHouseholdPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <EditHouseholdClient id={id} />;
}
