// Static not-found page that uses only HTML elements
// This helps with static generation during build

export default function NotFoundPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
            <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
            <p className="mb-6">The page you are looking for does not exist.</p>
            <div>
                <form action="/" className="inline">
                    <button
                        type="submit"
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                        Return to Home
                    </button>
                </form>
            </div>
        </div>
    );
}
