import EditHouseholdClient from "./client";
import { AuthProtection } from "@/components/AuthProtection";
import { getHouseholds } from "../../actions";

// Generate static params for household IDs
export async function generateStaticParams() {
    try {
        // Get all households to generate static params for their IDs
        const households = await getHouseholds();
        return households.map(household => ({ id: household.id }));
    } catch (error) {
        console.error("Error generating static params for households:", error);
        // Return empty array to fallback to dynamic rendering
        return [];
    }
}

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
