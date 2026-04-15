"use client";

import { useEffect, useImperativeHandle, useMemo, useState, forwardRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Minus,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeEmailHtml } from "@/lib/sanitize-email-html";

export interface RichTextEditorHandle {
  insertText: (text: string) => void;
  getHtml: () => string;
  focus: () => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  minHeight?: number;
}

type Mode = "visual" | "code";
type Block = "paragraph" | "h1" | "h2" | "h3";

const BLOCK_OPTIONS: { value: Block; label: string }[] = [
  { value: "paragraph", label: "Párrafo" },
  { value: "h1", label: "Encabezado 1" },
  { value: "h2", label: "Encabezado 2" },
  { value: "h3", label: "Encabezado 3" },
];

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ value, onChange, disabled = false, minHeight = 240 }, ref) {
    const [mode, setMode] = useState<Mode>("visual");
    const [fullscreen, setFullscreen] = useState(false);
    const [codeValue, setCodeValue] = useState(value);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
      ],
      content: value || "<p></p>",
      editable: !disabled,
      immediatelyRender: false, // required for Next.js SSR hydration
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none px-4 py-3 text-sm leading-relaxed [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_hr]:my-4",
        },
      },
      onUpdate: ({ editor }) => {
        const html = sanitizeEmailHtml(editor.getHTML());
        onChange(html);
        setCodeValue(html);
      },
    });

    // Keep editor in sync when parent sets value externally (e.g. loading a template)
    useEffect(() => {
      if (!editor) return;
      if (value !== editor.getHTML()) {
        editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
        setCodeValue(value);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, editor]);

    useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          if (mode === "code") {
            // Insert at end of raw HTML
            const next = (codeValue || "") + text;
            setCodeValue(next);
            onChange(sanitizeEmailHtml(next));
            if (editor) editor.commands.setContent(next || "<p></p>", { emitUpdate: false });
            return;
          }
          if (!editor) return;
          editor.chain().focus().insertContent(text).run();
        },
        getHtml: () => (editor ? sanitizeEmailHtml(editor.getHTML()) : codeValue),
        focus: () => editor?.commands.focus(),
      }),
      [editor, mode, codeValue, onChange]
    );

    const currentBlock: Block = useMemo(() => {
      if (!editor) return "paragraph";
      if (editor.isActive("heading", { level: 1 })) return "h1";
      if (editor.isActive("heading", { level: 2 })) return "h2";
      if (editor.isActive("heading", { level: 3 })) return "h3";
      return "paragraph";
    }, [editor, editor?.state.selection]);

    if (!editor) {
      return (
        <div
          className="rounded-lg border border-border bg-background"
          style={{ minHeight }}
        />
      );
    }

    const setBlock = (block: Block) => {
      if (block === "paragraph") editor.chain().focus().setParagraph().run();
      else editor.chain().focus().toggleHeading({ level: Number(block[1]) as 1 | 2 | 3 }).run();
    };

    const addLink = () => {
      const current = editor.getAttributes("link").href as string | undefined;
      const href = window.prompt("URL del enlace (https://…)", current || "https://");
      if (href === null) return; // cancelled
      if (href === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      // Reject anything that's not http(s)/mailto/tel — defense in depth
      if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(href)) return;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    };

    const containerCls = cn(
      "rounded-lg border border-border bg-background overflow-hidden",
      fullscreen && "fixed inset-4 z-50 shadow-2xl flex flex-col"
    );

    return (
      <>
        {fullscreen && (
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
            onClick={() => setFullscreen(false)}
          />
        )}

        <div className={containerCls}>
          {/* Tab strip */}
          <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
            <TabBtn active={mode === "visual"} onClick={() => setMode("visual")}>
              Visual
            </TabBtn>
            <TabBtn
              active={mode === "code"}
              onClick={() => {
                // Ensure code mirror reflects latest sanitized editor state
                setCodeValue(sanitizeEmailHtml(editor.getHTML()));
                setMode("code");
              }}
            >
              Código
            </TabBtn>
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => setFullscreen(!fullscreen)}
                disabled={disabled}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              >
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Toolbar (visual only) */}
          {mode === "visual" && (
            <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/20 px-2 py-1.5">
              <select
                value={currentBlock}
                onChange={(e) => setBlock(e.target.value as Block)}
                disabled={disabled}
                className="mr-1 h-7 rounded-md border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40"
              >
                {BLOCK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <Sep />

              <ToolBtn
                title="Negrita (Ctrl+B)"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={disabled}
              >
                <Bold className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Cursiva (Ctrl+I)"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={disabled}
              >
                <Italic className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Subrayado"
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                disabled={disabled}
              >
                <UnderlineIcon className="h-3.5 w-3.5" />
              </ToolBtn>

              <Sep />

              <ToolBtn
                title="Lista con viñetas"
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                disabled={disabled}
              >
                <List className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Lista numerada"
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                disabled={disabled}
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Cita"
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                disabled={disabled}
              >
                <Quote className="h-3.5 w-3.5" />
              </ToolBtn>

              <Sep />

              <ToolBtn
                title="Alinear a la izquierda"
                active={editor.isActive({ textAlign: "left" })}
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
                disabled={disabled}
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Centrar"
                active={editor.isActive({ textAlign: "center" })}
                onClick={() => editor.chain().focus().setTextAlign("center").run()}
                disabled={disabled}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Alinear a la derecha"
                active={editor.isActive({ textAlign: "right" })}
                onClick={() => editor.chain().focus().setTextAlign("right").run()}
                disabled={disabled}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </ToolBtn>

              <Sep />

              <ToolBtn
                title="Enlace"
                active={editor.isActive("link")}
                onClick={addLink}
                disabled={disabled}
              >
                <LinkIcon className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Línea horizontal"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                disabled={disabled}
              >
                <Minus className="h-3.5 w-3.5" />
              </ToolBtn>

              <Sep />

              <ToolBtn
                title="Deshacer (Ctrl+Z)"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={disabled || !editor.can().undo()}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                title="Rehacer (Ctrl+Shift+Z)"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={disabled || !editor.can().redo()}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </ToolBtn>
            </div>
          )}

          {/* Body — either the rich editor or the raw HTML textarea */}
          <div
            className={cn("bg-background", fullscreen && "flex-1 overflow-y-auto")}
            style={fullscreen ? undefined : { minHeight }}
          >
            {mode === "visual" ? (
              <EditorContent editor={editor} />
            ) : (
              <textarea
                value={codeValue}
                onChange={(e) => {
                  setCodeValue(e.target.value);
                  // Don't sanitize while typing to keep caret stable; sanitize on blur / tab-switch.
                  onChange(e.target.value);
                }}
                onBlur={() => {
                  const clean = sanitizeEmailHtml(codeValue);
                  setCodeValue(clean);
                  onChange(clean);
                  // Push sanitized HTML back into TipTap so Visual reflects the change
                  editor.commands.setContent(clean || "<p></p>", { emitUpdate: false });
                }}
                disabled={disabled}
                spellCheck={false}
                className="w-full h-full resize-none border-0 bg-background px-4 py-3 font-mono text-xs leading-relaxed focus:outline-none disabled:opacity-50"
                style={fullscreen ? { minHeight: "100%" } : { minHeight }}
              />
            )}
          </div>
        </div>
      </>
    );
  }
);

// ── Small helpers ─────────────────────────────────────────────────────────
function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
        "disabled:opacity-40 disabled:cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-4 w-px bg-border" />;
}
