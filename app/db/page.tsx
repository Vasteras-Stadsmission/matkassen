import { addHouseholdAction, deleteHouseholdAction } from "./actions";
import { db } from "./drizzle";
import { households } from "./schema";

export const dynamic = "force-dynamic";

export default async function Home() {
    const householdList = await db.select().from(households).orderBy(households.created_at);

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Households</h1>

            <div className="mb-6 p-4 border rounded">
                <h2 className="text-xl mb-2">Add New Household</h2>
                <form action={addHouseholdAction} className="flex flex-col gap-2">
                    <div>
                        <label htmlFor="first_name" className="block">
                            First Name:
                        </label>
                        <input
                            type="text"
                            id="first_name"
                            name="first_name"
                            required
                            className="border p-1 w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="last_name" className="block">
                            Last Name:
                        </label>
                        <input
                            type="text"
                            id="last_name"
                            name="last_name"
                            required
                            className="border p-1 w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="phone_number" className="block">
                            Phone Number:
                        </label>
                        <input
                            type="text"
                            id="phone_number"
                            name="phone_number"
                            required
                            className="border p-1 w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="locale" className="block">
                            Locale (2-letter code):
                        </label>
                        <input
                            type="text"
                            id="locale"
                            name="locale"
                            required
                            maxLength={2}
                            className="border p-1 w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="postal_code" className="block">
                            Postal Code (5 digits):
                        </label>
                        <input
                            type="number"
                            id="postal_code"
                            name="postal_code"
                            required
                            min="10000"
                            max="99999"
                            className="border p-1 w-full"
                        />
                    </div>

                    <button type="submit" className="bg-blue-500 text-white p-2 mt-2">
                        Add Household
                    </button>
                </form>
            </div>

            <div>
                <h2 className="text-xl mb-2">Household List</h2>
                {householdList.length === 0 ? (
                    <p className="text-gray-500">No households found</p>
                ) : (
                    <ul className="border rounded divide-y">
                        {householdList.map(household => (
                            <li
                                key={household.id}
                                className="p-3 flex justify-between items-center"
                            >
                                <div>
                                    <strong>
                                        {household.first_name} {household.last_name}
                                    </strong>
                                    <div className="text-sm text-gray-600">
                                        Phone: {household.phone_number} | Locale: {household.locale}{" "}
                                        | Postal: {household.postal_code}
                                    </div>
                                </div>
                                <form action={deleteHouseholdAction}>
                                    <input type="hidden" value={household.id} name="id" />
                                    <button
                                        type="submit"
                                        className="bg-red-500 text-white px-3 py-1 rounded"
                                    >
                                        Delete
                                    </button>
                                </form>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
