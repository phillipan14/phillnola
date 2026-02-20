import { useState, useEffect, useCallback } from "react";

/* ── Types ────────────────────────────────────────────────────────── */

interface Recipe {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_default: number;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function isBuiltIn(recipe: Recipe): boolean {
  return recipe.id.startsWith("recipe-");
}

/* ── RecipeEditor Component ──────────────────────────────────────── */

export default function RecipeEditor({ onClose }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Editor form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load recipes
  const loadRecipes = useCallback(async () => {
    const list = (await window.phillnola.recipes.list()) as Recipe[];
    setRecipes(list);
    return list;
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Populate form when selection changes
  useEffect(() => {
    const recipe = recipes.find((r) => r.id === selectedId);
    if (recipe) {
      setName(recipe.name);
      setDescription(recipe.description);
      setSystemPrompt(recipe.system_prompt);
      setIsDefault(recipe.is_default === 1);
    }
    setConfirmDelete(false);
    setSaved(false);
  }, [selectedId, recipes]);

  const selectedRecipe = recipes.find((r) => r.id === selectedId);

  /* ── Handlers ───────────────────────────────────────────────────── */

  const handleSave = useCallback(async () => {
    if (!name.trim() || !systemPrompt.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt,
        is_default: isDefault,
      };
      if (selectedId) {
        data.id = selectedId;
      }
      const result = (await window.phillnola.recipes.save(data)) as Recipe;
      const list = await loadRecipes();
      // If this was a new recipe, select it
      if (!selectedId) {
        setSelectedId(result.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [name, description, systemPrompt, isDefault, selectedId, loadRecipes]);

  const handleDelete = useCallback(async () => {
    if (!selectedId || !selectedRecipe || isBuiltIn(selectedRecipe)) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    await window.phillnola.recipes.delete(selectedId);
    setSelectedId(null);
    setName("");
    setDescription("");
    setSystemPrompt("");
    setIsDefault(false);
    setConfirmDelete(false);
    await loadRecipes();
  }, [selectedId, selectedRecipe, confirmDelete, loadRecipes]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedRecipe) return;
    const data = {
      name: `${selectedRecipe.name} (Copy)`,
      description: selectedRecipe.description,
      system_prompt: selectedRecipe.system_prompt,
      is_default: false,
    };
    const result = (await window.phillnola.recipes.save(data)) as Recipe;
    await loadRecipes();
    setSelectedId(result.id);
  }, [selectedRecipe, loadRecipes]);

  const handleCreateNew = useCallback(() => {
    setSelectedId(null);
    setName("");
    setDescription("");
    setSystemPrompt("");
    setIsDefault(false);
    setSaved(false);
  }, []);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Titlebar drag region */}
      <div className="drag-region" style={{ height: 38 }} />

      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "0 48px 28px 48px",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <div className="flex items-center" style={{ gap: 16 }}>
          <button
            onClick={onClose}
            className="btn btn-ghost no-drag"
            style={{ padding: 10 }}
            title="Back"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            Recipe Editor
          </h1>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost no-drag"
          style={{ padding: 10 }}
          title="Close"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body: sidebar list + editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Recipe List (Left Pane) ──────────────────────────── */}
        <div
          className="flex flex-col"
          style={{
            width: 260,
            minWidth: 260,
            borderRight: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg-secondary)",
          }}
        >
          <div className="flex-1 overflow-y-auto" style={{ padding: "16px 12px" }}>
            {/* Section label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "8px 12px",
                color: "var(--color-text-muted)",
              }}
            >
              Recipes
            </div>

            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => setSelectedId(recipe.id)}
                className="w-full text-left"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  backgroundColor:
                    selectedId === recipe.id
                      ? "var(--color-bg-active)"
                      : "transparent",
                  border: "none",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== recipe.id)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== recipe.id)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "transparent";
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="truncate"
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {recipe.name}
                  </div>
                  <div
                    className="truncate"
                    style={{
                      fontSize: 12,
                      marginTop: 2,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {isBuiltIn(recipe) ? "Built-in" : "Custom"}
                    {recipe.is_default === 1 && " \u00b7 Default"}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Create New button */}
          <div
            style={{
              padding: "14px 14px",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <button
              onClick={handleCreateNew}
              className="btn btn-ghost no-drag w-full"
              style={{
                fontSize: 14,
                gap: 8,
                padding: "10px 14px",
                justifyContent: "center",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Recipe
            </button>
          </div>
        </div>

        {/* ── Editor (Right Pane) ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div style={{ padding: "40px 48px", maxWidth: 640 }}>
            {/* Name */}
            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 10,
                  color: "var(--color-text-primary)",
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Product Sync, Board Meeting..."
                className="outline-none"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontSize: 14,
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1.5px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 10,
                  color: "var(--color-text-primary)",
                }}
              >
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of when to use this recipe"
                className="outline-none"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontSize: 14,
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1.5px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* System Prompt */}
            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 10,
                  color: "var(--color-text-primary)",
                }}
              >
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instructions for how the AI should structure notes from this type of meeting..."
                className="outline-none"
                rows={16}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.65,
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1.5px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                  fontFamily:
                    '"SF Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
                  resize: "vertical",
                }}
              />
            </div>

            {/* Set as Default toggle */}
            <div style={{ marginBottom: 36 }}>
              <button
                onClick={() => setIsDefault(!isDefault)}
                className="flex items-center"
                style={{
                  gap: 12,
                  padding: "14px 20px",
                  borderRadius: 12,
                  width: "100%",
                  backgroundColor: isDefault
                    ? "var(--color-accent-subtle)"
                    : "var(--color-bg-secondary)",
                  border: `1.5px solid ${
                    isDefault
                      ? "var(--color-accent)"
                      : "var(--color-border)"
                  }`,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: `2px solid ${
                      isDefault
                        ? "var(--color-accent)"
                        : "var(--color-border)"
                    }`,
                    backgroundColor: isDefault
                      ? "var(--color-accent)"
                      : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s ease",
                    flexShrink: 0,
                  }}
                >
                  {isDefault && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Set as Default Recipe
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      marginTop: 2,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    New meetings will use this recipe automatically
                  </div>
                </div>
              </button>
            </div>

            {/* Action Buttons */}
            <div
              className="flex items-center"
              style={{ gap: 12, flexWrap: "wrap" }}
            >
              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !systemPrompt.trim()}
                className="no-drag transition-all"
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  backgroundColor:
                    name.trim() && systemPrompt.trim()
                      ? "var(--color-accent)"
                      : "var(--color-bg-hover)",
                  color:
                    name.trim() && systemPrompt.trim()
                      ? "#fff"
                      : "var(--color-text-placeholder)",
                  cursor:
                    name.trim() && systemPrompt.trim()
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                {saving ? "Saving..." : saved ? "Saved!" : selectedId ? "Save Changes" : "Create Recipe"}
              </button>

              {/* Duplicate (for any selected recipe) */}
              {selectedRecipe && (
                <button
                  onClick={handleDuplicate}
                  className="btn btn-ghost no-drag"
                  style={{ fontSize: 14, padding: "12px 20px" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Duplicate
                </button>
              )}

              {/* Delete (only for user-created recipes) */}
              {selectedRecipe && !isBuiltIn(selectedRecipe) && (
                <button
                  onClick={handleDelete}
                  className="no-drag transition-colors"
                  style={{
                    padding: "12px 20px",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    border: confirmDelete
                      ? "none"
                      : "1px solid var(--color-recording)",
                    backgroundColor: confirmDelete
                      ? "var(--color-recording)"
                      : "transparent",
                    color: confirmDelete ? "#fff" : "var(--color-recording)",
                    cursor: "pointer",
                    marginLeft: "auto",
                  }}
                >
                  {confirmDelete ? "Confirm Delete" : "Delete"}
                </button>
              )}
            </div>

            {/* Built-in notice */}
            {selectedRecipe && isBuiltIn(selectedRecipe) && (
              <p
                style={{
                  fontSize: 12,
                  marginTop: 16,
                  color: "var(--color-text-muted)",
                }}
              >
                This is a built-in recipe. Changes will be saved in place.
                Use Duplicate to create an editable copy.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
