import React, { useEffect } from 'react';
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
        // Avoid infinite loop if content is same
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: `prose max-w-none focus:outline-none ${className}`,
      },
      handleKeyDown: (view, event) => {
        if (highlightOnly) {
          // Allow selection/navigation keys and common shortcuts (copy/select all) but block everything else
          const isMeta = event.ctrlKey || event.metaKey;
          const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Tab'];
          const shortcutKeys = ['c', 'a', 'z', 'y'];

          if (navKeys.includes(event.key)) return false;
          if (isMeta && shortcutKeys.includes(event.key.toLowerCase())) return false;

          return true; // Block input
        }
        return false;
      },
      handleDOMEvents: {
        mouseup: (view, event) => {
          if (!readOnly && (activeColor || isEraserActive)) {
            const { state } = view;
            const { selection } = state;
            if (!selection.empty) {
              if (isEraserActive) {
                view.dispatch(state.tr.removeMark(selection.from, selection.to, state.schema.marks.highlight));
              } else if (activeColor) {
                view.dispatch(state.tr.addMark(selection.from, selection.to, state.schema.marks.highlight.create({ color: activeColor })));
              }
              return true;
            }
          }
          return false;
        }
      }
    }
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Handle "type with highlight"
  useEffect(() => {
    if (editor && !readOnly) {
      if (activeColor && !isEraserActive) {
        editor.chain().focus().setHighlight({ color: activeColor }).run();
      } else if (!activeColor) {
        editor.chain().focus().unsetHighlight().run();
      }
    }
  }, [activeColor, isEraserActive, editor, readOnly]);

  return editor;
};

export const EditorToolbar = ({
  editors = [],
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
    setActiveColor(color);
    setIsEraserActive(false);
  };

  const clearHighlight = () => {
    setActiveColor(null);
    setIsEraserActive(false);
  };

  const isMarkActive = (type) => {
    return editors.some(editor => editor?.isActive(type));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 border-b bg-gray-50 rounded-t-xl sticky top-0 z-20 shadow-sm">
      {showFormatting && (
        <div className="flex items-center gap-1 pr-2 border-r border-gray-300">
          <button
            type="button"
            onClick={() => {
              const focused = editors.find(e => e?.isFocused) || editors[0];
              focused?.chain().focus().toggleBold().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-200 ${isMarkActive('bold') ? 'bg-gray-200 text-indigo-600' : 'text-gray-600'}`}
            title={t('editor.bold')}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const focused = editors.find(e => e?.isFocused) || editors[0];
              focused?.chain().focus().toggleItalic().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-200 ${isMarkActive('italic') ? 'bg-gray-200 text-indigo-600' : 'text-gray-600'}`}
            title={t('editor.italic')}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const focused = editors.find(e => e?.isFocused) || editors[0];
              focused?.chain().focus().toggleUnderline().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-200 ${isMarkActive('underline') ? 'bg-gray-200 text-indigo-600' : 'text-gray-600'}`}
            title={t('editor.underline')}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 pr-2 border-r border-gray-300">
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
          onClick={clearHighlight}
          className={`p-1.5 rounded hover:bg-gray-200 ${(!activeColor && !isEraserActive) ? 'bg-gray-200 text-indigo-600' : 'text-gray-600'}`}
          title={t('editor.no_highlight')}
        >
          <MinusCircle className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={toggleEraser}
          className={`p-1.5 rounded hover:bg-gray-200 ${isEraserActive ? 'bg-gray-200 text-red-600' : 'text-gray-600'}`}
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
