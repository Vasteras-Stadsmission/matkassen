import EditHouseholdClient from "./client";

// Define type for params
type Params = {
    id: string;
    locale: string;
};

export default async function EditHouseholdPage({ params }: { params: Params | Promise<Params> }) {
    const { id } = await params;
    return <EditHouseholdClient id={id} />;
}
