import { useCallback } from 'react';
import CopyIcon, { useCopyFeedback } from './CopyIcon';

export default function CopyableInput({
  value,
  title,
}: {
  value: string;
  title?: string;
}) {
  const getValue = useCallback(() => value, [value]);
  const { copied, copy } = useCopyFeedback(getValue);

  return (
    <span className="relative min-w-0 group">
      <input
        value={copied ? 'Copied!' : value}
        readOnly
        title={title ?? 'Click to copy'}
        onClick={copy}
        className={`w-full ${copied ? '!text-green-400 !font-normal' : ''}`}
      />
      <CopyIcon copied={copied} onCopy={copy} />
    </span>
  );
}
