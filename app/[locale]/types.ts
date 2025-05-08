// Define a translation function type that can be used across components
export interface TranslationFunction {
    (key: string, params?: Record<string, unknown>): string;
}
