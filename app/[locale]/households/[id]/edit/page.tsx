import EditHouseholdClient from "./client";
import { AuthProtection } from "@/components/AuthProtection";

// Define type for params
type Params = {
    id: string;
    locale: string;
};

export default async function EditHouseholdPage({ params }: { params: Params | Promise<Params> }) {
    const { id } = await params;
    return (
        <AuthProtection>
            <EditHouseholdClient id={id} />
        </AuthProtection>
    );
}
