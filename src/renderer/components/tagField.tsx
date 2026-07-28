import {
  useCallback,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import { normalizeTag, splitTagInput, TAG_SEPARATOR } from '../../lib/tags';
import { RemovableTag } from './removableTag';

interface TagFieldProps {
  label: string;
  onAddTags: (tags: string[]) => void;
  onRemoveTag: (tag: string) => void;
  placeholder?: string;
  tags: string[];
}

/**
 * One labelled group of tag pills plus the input used to add more.
 *
 * Committing rules:
 * - Typing a comma commits everything before it; any text after the last comma
 *   stays in the input as the next pending tag.
 * - Pasting a comma-delimited string commits every segment at once.
 * - Enter and blur commit whatever is pending, so text typed without a trailing
 *   comma isn't silently lost when the user saves.
 */
export const TagField = ({ label, onAddTags, onRemoveTag, placeholder, tags }: TagFieldProps) => {
  const [pending, setPending] = useState('');

  const commitPending = useCallback(() => {
    const tag = normalizeTag(pending);

    if (tag.length > 0) {
      onAddTags([tag]);
    }

    setPending('');
  }, [onAddTags, pending]);

  const handleChange = useCallback(
    (changeEvent: ChangeEvent<HTMLInputElement>) => {
      const { value } = changeEvent.currentTarget;

      if (!value.includes(TAG_SEPARATOR)) {
        setPending(value);
        return;
      }

      // Everything before the final comma is complete; the tail is still being typed.
      const segments = value.split(TAG_SEPARATOR);
      const tail = segments.pop() ?? '';

      onAddTags(splitTagInput(segments.join(TAG_SEPARATOR)));
      setPending(tail);
    },
    [onAddTags]
  );

  const handlePaste = useCallback(
    (pasteEvent: ReactClipboardEvent<HTMLInputElement>) => {
      const pasted = pasteEvent.clipboardData.getData('text');

      if (!pasted.includes(TAG_SEPARATOR)) {
        // No delimiters: let the browser insert the text so the caret and any
        // selection behave normally. It becomes a tag on the next comma.
        return;
      }

      pasteEvent.preventDefault();

      const input = pasteEvent.currentTarget;
      const selectionStart = input.selectionStart ?? input.value.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      const combined = `${input.value.slice(0, selectionStart)}${pasted.replaceAll('"', '')}${input.value.slice(selectionEnd)}`;

      onAddTags(splitTagInput(combined));
      setPending('');
    },
    [onAddTags]
  );

  const handleKeyDown = useCallback(
    (keyboardEvent: ReactKeyboardEvent<HTMLInputElement>) => {
      if (keyboardEvent.key !== 'Enter') {
        return;
      }

      // Enter commits a tag rather than submitting the surrounding form.
      keyboardEvent.preventDefault();
      commitPending();
    },
    [commitPending]
  );

  return (
    <div className="tag-field">
      <h3 className="text-xs font-bold text-[#3b3b3b]">{label}</h3>
      <div className="mt-1 flex min-h-8 flex-wrap items-center rounded-[3px] border border-neutral-700 bg-white p-1 focus-within:border-orange-400">
        {tags.map((tag) => (
          <RemovableTag key={tag} tag={tag} onRemove={onRemoveTag} />
        ))}
        <input
          type="text"
          value={pending}
          placeholder={tags.length === 0 ? placeholder : undefined}
          spellCheck="false"
          onBlur={commitPending}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="min-w-24 flex-1 bg-transparent px-1 text-xs text-[#3b3b3b] caret-orange-600 focus-visible:outline-none"
        />
      </div>
    </div>
  );
};
