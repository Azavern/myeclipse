'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  DEFAULT_CUSTOM_STYLE, DEFAULT_ICON_STYLE, DEFAULT_QR_STYLE, QR_MAX_ICON_BYTES, QR_MAX_TEXT_BYTES,
  composeQrStyle, qrContrast, textByteLength,
  type QrBarOrientation, type QrDotShape, type QrIconFit, type QrIconShape, type QrIconStyle, type QrMode,
} from '@/lib/qr/style';
import { validateQrText } from '@/lib/qr/text';
import { luminance } from '@/lib/theme/contrast';

export const DOT_SHAPES: { value: QrDotShape; label: string; hint: string }[] = [
  { value: 'square', label: 'Kotak', hint: 'Modul kotak rapi, paling mudah dipindai.' },
  { value: 'circle', label: 'Bulat', hint: 'Titik bulat dengan finder membulat.' },
  { value: 'block', label: 'Balok', hint: 'Modul bersebelahan menyatu jadi balok pill; orientasinya bisa dipilih.' },
];

export const BAR_ORIENTATIONS: { value: QrBarOrientation; label: string; hint: string }[] = [
  { value: 'horizontal', label: 'Horizontal (mendatar)', hint: 'Balok mendatar, sama seperti versi balok sebelumnya.' },
  { value: 'vertical', label: 'Vertikal (tegak)', hint: 'Balok tegak, geometri horizontal diputar 90°.' },
  { value: 'diagonal_down', label: 'Diagonal turun (↘)', hint: 'Balok miring dari kiri-atas ke kanan-bawah.' },
  { value: 'diagonal_up', label: 'Diagonal naik (↗)', hint: 'Balok miring dari kiri-bawah ke kanan-atas.' },
];

export const ICON_SHAPES: { value: QrIconShape; label: string }[] = [
  { value: 'square', label: 'Kotak' },
  { value: 'rounded', label: 'Kotak membulat' },
  { value: 'circle', label: 'Bulat' },
  { value: 'triangle', label: 'Segitiga' },
  { value: 'outline', label: 'Outline mengikuti gambar' },
];

export const ICON_FITS: { value: QrIconFit; label: string }[] = [
  { value: 'crop', label: 'Padat (gambar memenuhi bentuk)' },
  { value: 'shrink', label: 'Diperkecil (gambar tampil utuh)' },
];

export type QrDraft = ReturnType<typeof useQrDraft>;

// State kontrol QR dipakai dua varian: anggota (preview canvas) dan tamu
// (render server). Modul ini tidak mengimpor encoder atau canvas QR.
export function useQrDraft() {
  const [mode, setMode] = useState<QrMode>('normal');
  const [text, setText] = useState('');
  const [dotShape, setDotShape] = useState<QrDotShape>('square');
  const [barOrientation, setBarOrientation] = useState<QrBarOrientation>('horizontal');
  const [fill, setFill] = useState(DEFAULT_CUSTOM_STYLE.fillColor);
  const [back, setBack] = useState(DEFAULT_CUSTOM_STYLE.backColor);
  const [iconOn, setIconOn] = useState(false);
  const [iconBitmap, setIconBitmap] = useState<ImageBitmap | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconName, setIconName] = useState('');
  const [iconError, setIconError] = useState('');
  const [iconStyle, setIconStyle] = useState<QrIconStyle>(DEFAULT_ICON_STYLE);
  const touchedColor = useRef(false);

  const content = text.trim();
  const textError = content ? validateQrText(content) : null;
  const iconMissing = mode === 'custom' && iconOn && !iconBitmap;
  const ratio = qrContrast(fill, back);
  const lowContrast = ratio < 4.5 || luminance(fill) > luminance(back);
  const style = useMemo(
    () => composeQrStyle({ mode, dotShape, barOrientation, fillColor: fill, backColor: back, icon: iconStyle }),
    [mode, dotShape, barOrientation, fill, back, iconStyle],
  );

  function changeMode(next: QrMode) {
    if (!touchedColor.current) {
      setFill(next === 'custom' ? DEFAULT_CUSTOM_STYLE.fillColor : DEFAULT_QR_STYLE.fillColor);
      setBack(DEFAULT_CUSTOM_STYLE.backColor);
    }
    setMode(next);
  }

  function updateIcon<K extends keyof QrIconStyle>(key: K, value: QrIconStyle[K]) {
    setIconStyle((current) => ({ ...current, [key]: value }));
  }

  async function chooseIcon(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > QR_MAX_ICON_BYTES) {
      setIconError('Ikon harus PNG, JPEG, atau WebP dan maksimal 5 MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 4096 || bitmap.height > 4096) {
        bitmap.close();
        setIconError('Dimensi ikon terlalu besar. Gunakan gambar maksimal 4096 px per sisi.');
        return;
      }
      setIconBitmap(bitmap);
      setIconPreview(URL.createObjectURL(file));
      setIconName(file.name);
      setIconError('');
      setIconOn(true);
    } catch {
      setIconError('Ikon tidak bisa dibaca. Coba file lain.');
    }
  }

  function removeIcon() {
    setIconOn(false);
    setIconBitmap(null);
    setIconPreview(null);
    setIconName('');
    setIconError('');
  }

  useEffect(() => {
    const bitmap = iconBitmap;
    return () => { bitmap?.close(); };
  }, [iconBitmap]);

  useEffect(() => () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);

  return {
    mode, text, dotShape, barOrientation, fill, back, iconOn, iconBitmap, iconPreview, iconName, iconError,
    iconStyle, content, textError, iconMissing, ratio, lowContrast, style,
    setText, changeMode, setDotShape, setBarOrientation, setFill, setBack, setIconOn, chooseIcon, removeIcon,
    updateIcon, setIconError,
    setFillTouched: (value: string) => { touchedColor.current = true; setFill(value); },
    setBackTouched: (value: string) => { touchedColor.current = true; setBack(value); },
    textBytes: textByteLength(content),
    maxTextBytes: QR_MAX_TEXT_BYTES,
  };
}
