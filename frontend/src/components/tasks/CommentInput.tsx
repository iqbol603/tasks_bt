import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type User } from '@/lib/api';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CommentInputProps {
  onSubmit: (content: string, mentionIds: string[]) => void;
  disabled?: boolean;
}

export function CommentInput({ onSubmit, disabled }: CommentInputProps) {
  const [text, setText] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  const filteredUsers = users.filter((u) => {
    const name = `${u.firstName} ${u.lastName}`.toLowerCase();
    return name.includes(mentionFilter.toLowerCase());
  });

  const handleChange = (value: string) => {
    setText(value);
    const atMatch = value.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
    } else {
      setShowMentions(false);
    }
  };

  const selectMention = (user: User) => {
    const name = `${user.firstName} ${user.lastName}`;
    const newText = text.replace(/@\w*$/, `@${name} `);
    setText(newText);
    setMentionIds((prev) => [...new Set([...prev, user.id])]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim(), mentionIds);
    setText('');
    setMentionIds([]);
  };

  return (
    <div className="relative">
      {showMentions && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-full max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-lg z-10">
          {filteredUsers.slice(0, 6).map((u) => (
            <button
              key={u.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => selectMention(u)}
            >
              {u.firstName} {u.lastName}
              <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Написать комментарий... (@ для упоминания)"
          rows={2}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button size="icon" className="self-end" onClick={handleSubmit} disabled={disabled || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function renderCommentContent(content: string) {
  const parts = content.split(/(@[\wа-яА-ЯёЁ]+\s?[\wа-яА-ЯёЁ]*)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-primary font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
