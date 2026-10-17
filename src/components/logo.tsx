import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Brand mark. Renders the black glyph on light surfaces and the white glyph on
 * dark surfaces using pure CSS `dark:` switching (no JS/`useTheme`), so the
 * correct asset is painted on first load with no hydration flash.
 *
 * Assets are pre-cropped to the glyph bounding box (954x706), so size by height
 * and let width follow `w-auto`.
 */
export function Logo({
  className,
  alt = 'Mpruy AI',
  priority = false,
}: {
  /** Height utility(s), e.g. `h-5` or `h-6`. Width is derived from the asset. */
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={alt}
      className={cn('relative inline-block shrink-0 select-none', className)}
    >
      <Image
        src="/mpruy-logo-black.png"
        alt=""
        width={954}
        height={706}
        priority={priority}
        draggable={false}
        className="h-full w-auto dark:hidden"
      />
      <Image
        src="/mpruy-logo-white.png"
        alt=""
        width={954}
        height={706}
        priority={priority}
        draggable={false}
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}