/**
 * Custom ESLint rules for the matkassen project
 *
 * These rules enforce best practices specific to our codebase,
 * particularly around error handling in server actions.
 */

module.exports = {
    "server-action-error-handling": {
        meta: {
            type: "problem",
            docs: {
                description:
                    "Enforce error handling in server actions that don't use protectedAction wrapper",
                category: "Best Practices",
                recommended: true,
            },
            messages: {
                missingTryCatch:
                    "Server actions must have try-catch blocks with logError() for proper structured logging. Alternatively, use the protectedAction() or protectedHouseholdAction() wrapper.",
            },
            schema: [],
        },

        create(context) {
            let isServerAction = false;
            let hasUseServerDirective = false;

            return {
                // Check if file has "use server" directive
                Program(node) {
                    hasUseServerDirective = node.body.some(
                        statement =>
                            statement.type === "ExpressionStatement" &&
                            statement.expression.type === "Literal" &&
                            statement.expression.value === "use server",
                    );
                },

                // Check exported async functions in server action files
                ExportNamedDeclaration(node) {
                    if (!hasUseServerDirective) return;

                    const declaration = node.declaration;

                    // Check for: export async function name() { }
                    if (
                        declaration &&
                        declaration.type === "FunctionDeclaration" &&
                        declaration.async
                    ) {
                        checkServerActionFunction(context, declaration);
                    }

                    // Check for: export const name = async function() { }
                    if (
                        declaration &&
                        declaration.type === "VariableDeclaration" &&
                        declaration.declarations.length > 0
                    ) {
                        const declarator = declaration.declarations[0];
                        if (
                            declarator.init &&
                            (declarator.init.type === "ArrowFunctionExpression" ||
                                declarator.init.type === "FunctionExpression") &&
                            declarator.init.async
                        ) {
                            // Check if it's wrapped with protectedAction
                            const isWrapped = isProtectedActionWrapper(declarator.init);
                            if (!isWrapped) {
                                checkServerActionFunction(context, declarator.init);
                            }
                        }

                        // Check for: export const name = protectedAction(...)
                        // This is OK - protectedAction has built-in error handling
                        if (declarator.init && declarator.init.type === "CallExpression") {
                            const callee = declarator.init.callee;
                            if (
                                callee.type === "Identifier" &&
                                (callee.name === "protectedAction" ||
                                    callee.name === "protectedHouseholdAction")
                            ) {
                                // This is wrapped with protectedAction - skip checking
                                return;
                            }
                        }
                    }
                },
            };
        },
    },
};

/**
 * Check if a function is wrapped with protectedAction
 */
function isProtectedActionWrapper(node) {
    // If the function is inside a CallExpression with protectedAction
    if (node.parent && node.parent.type === "CallExpression") {
        const callee = node.parent.callee;
        if (
            callee.type === "Identifier" &&
            (callee.name === "protectedAction" || callee.name === "protectedHouseholdAction")
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a server action function has proper error handling
 */
function checkServerActionFunction(context, functionNode) {
    if (!functionNode.body || functionNode.body.type !== "BlockStatement") {
        return;
    }

    const statements = functionNode.body.body;
    if (statements.length === 0) {
        return;
    }

    // Check if the function body contains a try-catch block
    const hasTryCatch = statements.some(statement => statement.type === "TryStatement");

    if (!hasTryCatch) {
        context.report({
            node: functionNode,
            messageId: "missingTryCatch",
        });
    }

    // If there's a try-catch, check if the catch block calls logError
    if (hasTryCatch) {
        statements.forEach(statement => {
            if (statement.type === "TryStatement" && statement.handler) {
                const catchBlock = statement.handler.body;
                const hasLogError = catchBlock.body.some(stmt => {
                    if (stmt.type === "ExpressionStatement") {
                        const expr = stmt.expression;
                        return (
                            expr.type === "CallExpression" &&
                            expr.callee.type === "Identifier" &&
                            expr.callee.name === "logError"
                        );
                    }
                    return false;
                });

                if (!hasLogError) {
                    context.report({
                        node: statement.handler,
                        message:
                            "Catch blocks in server actions should call logError() for structured logging",
                    });
                }
            }
        });
    }
}
