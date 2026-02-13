import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Eraser, MinusCircle } from 'lucide-react';
import { HIGHLIGHTER_COLORS } from '../lib/constants';
import { useTranslation } from 'react-i18next';

export const useRichTextEditor = ({
  content,
  onChange,
  placeholder,
  readOnly = false,
  highlightOnly = false,
  className = "",
  activeColor,
  isEraserActive
}) => {
  // Use refs to keep handlers up to date without re-creating the editor
  const activeColorRef = useRef(activeColor);
  const isEraserActiveRef = useRef(isEraserActive);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
    ],
    content: content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (onChange) {
        const html = editor.getHTML();
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: `prose max-w-none focus:outline-none ${className}`,
      },
      handleKeyDown: (view, event) => {
        if (highlightOnly) {
          const isMeta = event.ctrlKey || event.metaKey;
          const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Tab'];
          const shortcutKeys = ['c', 'a', 'z', 'y'];

          if (navKeys.includes(event.key)) return false;
          if (isMeta && shortcutKeys.includes(event.key.toLowerCase())) return false;

          return true;
        }
        return false;
      },
      handleDOMEvents: {
        mouseup: (view, event) => {
          const color = activeColorRef.current;
          const eraser = isEraserActiveRef.current;

          if (!readOnly && (color || eraser)) {
            const { state } = view;
            const { selection } = state;
            if (!selection.empty) {
              let tr = state.tr;
              if (eraser) {
                tr = tr.removeMark(selection.from, selection.to, state.schema.marks.highlight);
              } else if (color) {
                tr = tr.addMark(selection.from, selection.to, state.schema.marks.highlight.create({ color }));
              }

              // Collapse selection to the end to prevent immediate overwrite if color is changed
              const pos = selection.to;
              tr = tr.setSelection(state.selection.constructor.near(tr.doc.resolve(pos)));

              view.dispatch(tr);
              return true;
            }
          }
          return false;
        }
      }
    }
  });

  useEffect(() => {
    activeColorRef.current = activeColor;
    isEraserActiveRef.current = isEraserActive;

    if (editor) {
      editor.setOptions({
        editorProps: {
          handleDOMEvents: {
            mouseup: (view, event) => {
              const color = activeColorRef.current;
              const eraser = isEraserActiveRef.current;
              if (!readOnly && (color || eraser)) {
                const { state } = view;
                const { selection } = state;
                if (!selection.empty) {
                  let tr = state.tr;
                  if (eraser) {
                    tr = tr.removeMark(selection.from, selection.to, state.schema.marks.highlight);
                  } else if (color) {
                    tr = tr.addMark(selection.from, selection.to, state.schema.marks.highlight.create({ color }));
                  }
                  const pos = selection.to;
                  tr = tr.setSelection(state.selection.constructor.near(tr.doc.resolve(pos)));
                  view.dispatch(tr);
                  return true;
                }
              }
              return false;
            }
          }
        }
      });
    }
  }, [activeColor, isEraserActive, editor, readOnly]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Handle "type with highlight"
  useEffect(() => {
    if (editor && !readOnly) {
      if (activeColor && !isEraserActive) {
        // Set highlight for typing and apply to current selection if any
        editor.chain().setHighlight({ color: activeColor }).run();
      } else {
        // If color is removed or eraser is active, unset the "stored" highlight mark
        // but ONLY if the selection is empty to avoid removing highlights from existing text.
        // We use removeStoredMark surgically to avoid the "extendEmptyMarkRange" behavior
        // of the default unsetHighlight command which can delete the mark we just created.
        if (editor.state.selection.empty) {
          editor.view.dispatch(editor.state.tr.removeStoredMark(editor.state.schema.marks.highlight));
        }
      }
    }
  }, [activeColor, isEraserActive, editor, readOnly]);

  return editor;
};

export const EditorToolbar = ({
  highlightEditors = [],
  formatEditors = [],
  activeColor,
  setActiveColor,
  isEraserActive,
  setIsEraserActive,
  showFormatting = true
}) => {
  const { t } = useTranslation();

  const toggleEraser = () => {
    const newVal = !isEraserActive;
    setIsEraserActive(newVal);
    if (newVal) {
      setActiveColor(null);
    }
  };

  const selectColor = (color) => {
    if (activeColor === color) {
      setActiveColor(null);
    } else {
      setActiveColor(color);
      setIsEraserActive(false);
    }
  };

  const isMarkActive = (type) => {
    return formatEditors.some(editor => editor?.isActive(type));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-1 bg-transparent">
      {showFormatting && (
        <div className="flex items-center gap-1 pr-1 border-r border-gray-300">
          <button
            type="button"
            onClick={() => {
              const focused = formatEditors.find(e => e?.isFocused) || formatEditors[0];
              focused?.chain().focus().toggleBold().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 ${isMarkActive('bold') ? 'bg-gray-100 text-indigo-600' : 'text-gray-600'}`}
            title={t('editor.bold')}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const focused = formatEditors.find(e => e?.isFocused) || formatEditors[0];
              focused?.chain().focus().toggleItalic().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 ${isMarkActive('italic') ? 'bg-gray-100 text-indigo-600' : 'text-gray-600'}`}
            title={t('editor.italic')}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const focused = formatEditors.find(e => e?.isFocused) || formatEditors[0];
              focused?.chain().focus().toggleUnderline().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 ${isMarkActive('underline') ? 'bg-gray-100 text-indigo-600' : 'text-gray-600'}`}
            title={t('editor.underline')}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 pr-1 border-r border-gray-300">
        {HIGHLIGHTER_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectColor(c.color)}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${activeColor === c.color ? 'border-gray-600 scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c.color }}
            title={c.label}
          />
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleEraser}
          className={`p-1.5 rounded hover:bg-gray-100 ${isEraserActive ? 'bg-gray-100 text-red-600' : 'text-gray-600'}`}
          title={t('editor.eraser')}
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const RichTextRenderer = ({ content, className = "" }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
    ],
    content: content || '',
    editable: false,
    editorProps: {
      attributes: {
        class: `prose max-w-none ${className}`,
      },
    }
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  return <EditorContent editor={editor} />;
};
