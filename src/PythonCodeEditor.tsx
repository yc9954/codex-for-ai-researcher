import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";

const pythonHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c586c0" },
  { tag: [tags.bool, tags.null, tags.number], color: "#b5cea8" },
  { tag: [tags.string, tags.special(tags.string)], color: "#ce9178" },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: "#dcdcaa" },
  { tag: [tags.typeName, tags.className], color: "#4ec9b0" },
  { tag: [tags.propertyName, tags.attributeName], color: "#9cdcfe" },
  { tag: [tags.operator, tags.punctuation], color: "#d4d4d4" },
  { tag: [tags.comment, tags.docComment], color: "#6a9955", fontStyle: "italic" },
  { tag: tags.meta, color: "#d7ba7d" },
  { tag: tags.invalid, color: "#f48771", textDecoration: "underline" },
]);

const editorTheme = EditorView.theme({
  "&": {
    width: "100%",
    minHeight: "inherit",
    backgroundColor: "transparent",
    color: "#e8e8e8",
    fontSize: "12px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    minHeight: "inherit",
    maxHeight: "520px",
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.62",
  },
  ".cm-content": {
    minHeight: "inherit",
    padding: "13px 15px 15px",
    caretColor: "#f2f2f2",
    fontFamily: "var(--font-mono)",
  },
  ".cm-line": { padding: "0" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { backgroundColor: "#ffffff08" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "#264f78 !important",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f2f2f2" },
  ".cm-panels": { backgroundColor: "#212121", color: "#ececec" },
  ".cm-panels input": { border: "1px solid #4a4a4a", backgroundColor: "#2f2f2f" },
  ".cm-tooltip": { border: "1px solid #4a4a4a", backgroundColor: "#212121" },
}, { dark: true });

export default function PythonCodeEditor({ value, ariaLabel, onChange, onBlur }: {
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);

  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
  }, [onBlur, onChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        python(),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-multiline": "true", spellcheck: "false" }),
        EditorView.domEventHandlers({ blur: () => { onBlurRef.current(); return false; } }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({ ".cm-content": { tabSize: "4" } }),
        EditorView.baseTheme({ "&": { minHeight: "inherit" } }),
        syntaxHighlighting(pythonHighlightStyle),
        keymap.of([indentWithTab]),
        editorTheme,
      ],
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  const editorHeight = Math.max(108, Math.min(520, value.split("\n").length * 19.5 + 34));
  return <div ref={hostRef} className="python-code-editor" style={{ minHeight: `${editorHeight}px` }} />;
}
