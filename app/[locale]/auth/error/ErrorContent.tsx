"use client";

import { Button } from "@mantine/core";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";

export interface ErrorContentProps {
    messageKey: string;
}

export default function ErrorContent({ messageKey }: ErrorContentProps) {
    const router = useRouter();
    const t = useTranslations("wizard");

    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
                <h1>{t("error.title")}</h1>
                <p>
                    {messageKey
                        ? // Pick one of the predefined error messages based on a switch statement
                          (() => {
                              switch (messageKey) {
                                  case "general":
                                      return t("error.general");
                                  case "access":
                                      return t("backToHouseholds");
                                  case "server":
                                      return t("error.general");
                                  // Add more cases as needed
                                  default:
                                      return t("error.general");
                              }
                          })()
                        : t("error.general")}
                </p>

                <div className="mt-6">
                    <Button onClick={() => router.push("/")} color="blue" size="md" fullWidth>
                        {t("backToHouseholds")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
