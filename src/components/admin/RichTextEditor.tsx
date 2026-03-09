import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import LinkExt from "@tiptap/extension-link";
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Link, Image, Undo, Redo, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const MenuButton = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    title={title}
    onClick={onClick}
    className={cn("h-8 w-8 p-0", active && "bg-muted text-primary")}
  >
    {children}
  </Button>
);

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExt,
      LinkExt.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const addLink = () => {
    const url = window.prompt("Link URL");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="border border-input rounded-md overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-muted/30 p-1">
        <MenuButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Heading 1" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading1 className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Heading 2" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading2 className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Ordered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="w-4 h-4" />
        </MenuButton>
        <MenuButton title="Link" onClick={addLink}><Link className="w-4 h-4" /></MenuButton>
        <MenuButton title="Image" onClick={addImage}><Image className="w-4 h-4" /></MenuButton>
        <div className="ml-auto flex gap-0.5">
          <MenuButton title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo className="w-4 h-4" /></MenuButton>
          <MenuButton title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo className="w-4 h-4" /></MenuButton>
        </div>
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none p-4 min-h-[250px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[230px]" />
    </div>
  );
}
