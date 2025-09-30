/**
 * Custom ESLint rules for enforcing security patterns in the codebase
 */

module.exports = {
    "require-protected-server-action": {
        meta: {
            type: "problem",
            docs: {
                description:
                    "Enforce that server actions use protectedAction() or protectedHouseholdAction() wrapper",
                category: "Security",
                recommended: true,
            },
            messages: {
                missingProtection:
                    'Server action "{{name}}" must be wrapped with protectedAction() or protectedHouseholdAction() for authentication enforcement',
                directAuthCall:
                    "Direct use of verifyServerActionAuth() detected. Use protectedAction() wrapper instead for consistency",
            },
            schema: [],
        },
        create(context) {
            const sourceCode = context.getSourceCode();
            const filename = context.getFilename();

            // Only check files with "use server" directive
            const hasUseServer = sourceCode
                .getText()
                .split("\n")
                .some(line => line.trim() === '"use server";' || line.trim() === "'use server';");

            if (!hasUseServer) {
                return {};
            }

            return {
                // Check exported function declarations
                ExportNamedDeclaration(node) {
                    if (node.declaration?.type === "FunctionDeclaration") {
                        checkServerAction(node.declaration, context);
                    } else if (node.declaration?.type === "VariableDeclaration") {
                        node.declaration.declarations.forEach(decl => {
                            if (
                                decl.init &&
                                (decl.init.type === "ArrowFunctionExpression" ||
                                    decl.init.type === "FunctionExpression")
                            ) {
                                checkServerAction(decl, context);
                            }
                        });
                    }
                },

                // Check variable declarations that are exported
                VariableDeclaration(node) {
                    // Skip if not at module level
                    if (
                        node.parent.type !== "Program" &&
                        node.parent.type !== "ExportNamedDeclaration"
                    ) {
                        return;
                    }

                    node.declarations.forEach(decl => {
                        if (
                            decl.init &&
                            (decl.init.type === "ArrowFunctionExpression" ||
                                decl.init.type === "FunctionExpression" ||
                                decl.init.type === "CallExpression")
                        ) {
                            // Check if it's wrapped with protectedAction
                            if (decl.init.type === "CallExpression") {
                                const calleeName = getCalleeName(decl.init);
                                if (
                                    calleeName === "protectedAction" ||
                                    calleeName === "protectedHouseholdAction"
                                ) {
                                    return; // Already protected
                                }
                            }

                            // Check for direct verifyServerActionAuth calls
                            if (containsDirectAuthCall(decl.init, context)) {
                                context.report({
                                    node: decl.id || decl,
                                    messageId: "directAuthCall",
                                });
                            }
                        }
                    });
                },
            };
        },
    },
};

function checkServerAction(node, context) {
    const actionName = node.id?.name || node.name || "anonymous";

    // Check if the function is wrapped with protectedAction or protectedHouseholdAction
    const parent = node.parent;

    if (parent?.type === "VariableDeclarator" && parent.init?.type === "CallExpression") {
        const calleeName = getCalleeName(parent.init);
        if (calleeName === "protectedAction" || calleeName === "protectedHouseholdAction") {
            return; // Already protected
        }
    }

    // Check if function body contains verifyServerActionAuth
    const functionBody = node.body || node.declaration?.body || node.init?.body;
    if (functionBody && containsDirectAuthCall(functionBody, context)) {
        context.report({
            node: node.id || node,
            messageId: "directAuthCall",
        });
        return;
    }

    // If no protection found, report error
    if (functionBody && !containsProtectedWrapper(node)) {
        context.report({
            node: node.id || node,
            messageId: "missingProtection",
            data: {
                name: actionName,
            },
        });
    }
}

function getCalleeName(callExpression) {
    if (callExpression.callee.type === "Identifier") {
        return callExpression.callee.name;
    }
    if (callExpression.callee.type === "MemberExpression") {
        return callExpression.callee.property.name;
    }
    return null;
}

function containsDirectAuthCall(node, context) {
    let found = false;

    function traverse(n) {
        if (!n || found) return;

        if (n.type === "CallExpression") {
            const calleeName = getCalleeName(n);
            if (calleeName === "verifyServerActionAuth" || calleeName === "verifyHouseholdAccess") {
                found = true;
                return;
            }
        }

        // Traverse child nodes
        for (const key in n) {
            if (n[key] && typeof n[key] === "object") {
                if (Array.isArray(n[key])) {
                    n[key].forEach(traverse);
                } else {
                    traverse(n[key]);
                }
            }
        }
    }

    traverse(node);
    return found;
}

function containsProtectedWrapper(node) {
    let parent = node.parent;

    while (parent) {
        if (parent.type === "CallExpression") {
            const calleeName = getCalleeName(parent);
            if (calleeName === "protectedAction" || calleeName === "protectedHouseholdAction") {
                return true;
            }
        }
        parent = parent.parent;
    }

    return false;
}
