import { generateColor, Arc4, Xor4096, Xorwow, type ColorOptions } from '@marko19907/string-to-color';
import { type CSSProperties, useMemo } from 'react';

interface GenreProps {
  children: string;
}

export const Genre = (props: GenreProps) => {
  const { children } = props;
  const backgroundColor = useMemo(() => {
    // eslint-disable-next-line no-magic-numbers
    const lightness = Math.floor(Xorwow(children) * 20) + 35; // Somewhere between 35 and 55
    // eslint-disable-next-line no-magic-numbers
    const saturation = Math.floor(Arc4(children) * 20) + 65; // Somewhere between 65 and 85
    const options: ColorOptions = { algorithm: Xor4096, lightness, saturation, alpha: 55 };
    return generateColor(children, options);
  }, [children]);
  const style: CSSProperties = { backgroundColor };
  return (
    <div className="text-xxs relative mx-0.75 inline-block rounded-full px-1.5 pt-px text-white" style={style}>
      {children}
    </div>
  );
};
