import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { BulkMessageItem } from '../services/api';
import {
  MAX_BULK_PERSONALIZED,
  MAX_BULK_VARIATIONS,
  MAX_PERSONALIZED_CSV_BYTES,
  parsePersonalizedCsv,
  type BulkComposeMode,
  type PersonalizedRow,
} from '../utils/bulkPersonalization';

const STORAGE_KEY = 'openwa.bulk.text-variations.v1';
const VARIATION_FILE_MAX_BYTES = 18 * 1024 * 1024;
type VariationFile = { base64: string; mimetype: string; filename: string };

type Props = {
  mode: BulkComposeMode;
  onModeChange: (next: BulkComposeMode) => void;
  rows: PersonalizedRow[];
  onRowsChange: (rows: PersonalizedRow[]) => void;
  variations: string[];
  onVariationsChange: (next: string[]) => void;
  variationFiles: (VariationFile | null)[];
  onVariationFilesChange: Dispatch<SetStateAction<(VariationFile | null)[]>>;
  onAttachmentBusyChange: (busy: boolean) => void;
  onAttachmentErrorChange: (error: boolean) => void;
  preview: BulkMessageItem[];
  error: string | null;
  canWrite: boolean;
};

function errorText(t: (key: string) => string, code: string): string {
  const key = 'messageTester.bulkPersonalization.errors.' + code;
  return t(key);
}

export function BulkComposeOptions({
  mode, onModeChange, rows, onRowsChange, variations, onVariationsChange,
  variationFiles, onVariationFilesChange, onAttachmentBusyChange, onAttachmentErrorChange,
  preview, error, canWrite,
}: Props) {
  const { t } = useTranslation();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const readers = useRef(new Map<number, FileReader>());
  const showAttachmentError = (message: string) => {
    setAttachmentError(message);
    onAttachmentErrorChange(Boolean(message));
  };
  const syncAttachmentBusy = () => onAttachmentBusyChange(readers.current.size > 0);

  useEffect(() => {
    const activeReaders = readers.current;
    return () => {
      for (const reader of activeReaders.values()) reader.abort();
      activeReaders.clear();
    };
  }, []);

  const pickVariationFile = (event: ChangeEvent<HTMLInputElement>, index: number) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow reselecting the same file
    if (!file) return;
    readers.current.get(index)?.abort();
    readers.current.delete(index);
    syncAttachmentBusy();
    onVariationFilesChange(previous => {
      const next = [...previous];
      next[index] = null;
      return next;
    });
    showAttachmentError('');
    if (!file.size || file.size > VARIATION_FILE_MAX_BYTES) {
      showAttachmentError(t('messageTester.bulkPersonalization.attachmentFileTooLarge'));
      return;
    }
    if (file.type.toLowerCase().startsWith('audio/')) {
      showAttachmentError(t('messageTester.bulkPersonalization.attachmentAudioUnsupported'));
      return;
    }
    const mimetype = file.type || (
      /\.jpe?g$/i.test(file.name) ? 'image/jpeg' :
      /\.png$/i.test(file.name) ? 'image/png' :
      /\.webp$/i.test(file.name) ? 'image/webp' :
      /\.gif$/i.test(file.name) ? 'image/gif' :
      /\.mp4$/i.test(file.name) ? 'video/mp4' : 'application/octet-stream'
    );
    const reader = new FileReader();
    readers.current.set(index, reader);
    syncAttachmentBusy();
    reader.onload = () => {
      if (readers.current.get(index) !== reader) return;
      readers.current.delete(index);
      syncAttachmentBusy();
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (!base64) {
        showAttachmentError(t('messageTester.bulkPersonalization.attachmentReadError'));
        return;
      }
      onVariationFilesChange(previous => {
        const next = [...previous];
        next[index] = { base64, mimetype, filename: file.name };
        return next;
      });
    };
    reader.onerror = () => {
      if (readers.current.get(index) !== reader) return;
      readers.current.delete(index);
      syncAttachmentBusy();
      showAttachmentError(t('messageTester.bulkPersonalization.attachmentReadError'));
    };
    reader.readAsDataURL(file);
  };

  const removeVariation = (index: number) => {
    // Indexes shift when deleting entries. Cancel pending reads to prevent misassignment.
    for (const reader of readers.current.values()) reader.abort();
    readers.current.clear();
    syncAttachmentBusy();
    showAttachmentError('');
    onVariationFilesChange(previous => previous.filter((_, i) => i !== index));
    onVariationsChange(variations.filter((_, i) => i !== index));
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const loaded: unknown = JSON.parse(raw);
      if (Array.isArray(loaded) && loaded.length >= 2 &&
          loaded.length <= MAX_BULK_VARIATIONS &&
          loaded.every(value => typeof value === 'string' && value.length <= 4096)) {
        onVariationsChange(loaded);
      }
    } catch {
      // Storage can be disabled by the browser; leave the editor usable.
    }
    // One-time initialization only; edits must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCsvError(null);
    if (file.size > MAX_PERSONALIZED_CSV_BYTES) {
      setCsvError(errorText(t, 'fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') throw new Error('invalidCsv');
        const parsed = parsePersonalizedCsv(reader.result);
        onRowsChange(parsed.map(row => ({ ...row, id: String(nextId.current++) })));
        onModeChange('personalized');
      } catch (exception) {
        setCsvError(errorText(t, exception instanceof Error ? exception.message : 'invalidCsv'));
      }
    };
    reader.onerror = () => setCsvError(errorText(t, 'readError'));
    reader.readAsText(file, 'UTF-8');
  };

  const saveVariations = () => {
    try {
      const valid = variations.map(value => value.trim()).filter(Boolean);
      if (valid.length < 2 || valid.length > MAX_BULK_VARIATIONS) {
        setSaveMessage(errorText(t, 'needVariations'));
        return;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      setSaveMessage(t('messageTester.bulkPersonalization.saved'));
    } catch {
      setSaveMessage(errorText(t, 'storageUnavailable'));
    }
  };

  const removeSaved = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setSaveMessage(t('messageTester.bulkPersonalization.cleared'));
    } catch {
      setSaveMessage(errorText(t, 'storageUnavailable'));
    }
  };

  return (
    <div className="bulk-compose-options">
      <div className="form-group">
        <span className="group-label" id="bulk-compose-mode-label">{t('messageTester.bulkPersonalization.mode')}</span>
        <div className="bulk-mode-options" role="group" aria-labelledby="bulk-compose-mode-label">
          {(['same', 'personalized', 'random'] as const).map(value => (
            <button
              type="button"
              key={value}
              className={value === mode ? 'active' : ''}
              aria-pressed={value === mode}
              onClick={() => onModeChange(value)}
            >
              {t('messageTester.bulkPersonalization.modes.' + value)}
            </button>
          ))}
        </div>
        <span className="hint">{t('messageTester.bulkPersonalization.hint')}</span>
      </div>

      {mode === 'personalized' && (
        <div className="form-group">
          <div className="bulk-mode-header">
            <span className="group-label">{t('messageTester.bulkPersonalization.perRecipient')}</span>
            <button type="button" className="browse-btn" onClick={() => csvInputRef.current?.click()} disabled={!canWrite}>
              {t('messageTester.bulkPersonalization.importCsv')}
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={importCsv}
              style={{ display: 'none' }}
            />
          </div>
          <span className="hint">{t('messageTester.bulkPersonalization.csvHint')}</span>
          {csvError && <span className="hint error" role="alert">{csvError}</span>}
          <div className="bulk-personalized-rows">
            {rows.map((row, index) => (
              <div className="bulk-personalized-row" key={row.id}>
                <div>
                  <label htmlFor={`bulk-row-phone-${row.id}`}>{t('messageTester.bulkPersonalization.phone', { index: index + 1 })}</label>
                  <input
                    id={`bulk-row-phone-${row.id}`}
                    type="text"
                    value={row.recipient}
                    disabled={!canWrite}
                    onChange={e => onRowsChange(rows.map(item => item.id === row.id ? { ...item, recipient: e.target.value } : item))}
                  />
                </div>
                <div>
                  <label htmlFor={`bulk-row-message-${row.id}`}>{t('messageTester.bulkPersonalization.message')}</label>
                  <textarea
                    id={`bulk-row-message-${row.id}`}
                    value={row.message}
                    rows={2}
                    maxLength={4096}
                    disabled={!canWrite}
                    onChange={e => onRowsChange(rows.map(item => item.id === row.id ? { ...item, message: e.target.value } : item))}
                  />
                </div>
                <button
                  type="button"
                  className="browse-btn"
                  disabled={!canWrite}
                  onClick={() => onRowsChange(rows.filter(item => item.id !== row.id))}
                >
                  {t('messageTester.bulkPersonalization.remove')}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="browse-btn"
            disabled={!canWrite || rows.length >= MAX_BULK_PERSONALIZED}
            onClick={() => onRowsChange([...rows, { id: String(nextId.current++), recipient: '', message: '' }])}
          >
            {t('messageTester.bulkPersonalization.addRow')}
          </button>
        </div>
      )}

      {mode === 'random' && (
        <div className="form-group">
          <span className="group-label">{t('messageTester.bulkPersonalization.variations')}</span>
          <span className="hint">{t('messageTester.bulkPersonalization.randomHint')}</span>
          {variations.map((value, index) => (
            <div className="bulk-variation" key={index}>
              <label htmlFor={`bulk-variant-${index}`}>{t('messageTester.bulkPersonalization.variation', { index: index + 1 })}</label>
              <textarea
                id={`bulk-variant-${index}`}
                rows={2}
                maxLength={4096}
                value={value}
                disabled={!canWrite}
                onChange={event => onVariationsChange(variations.map((item, i) => i === index ? event.target.value : item))}
              />
              <div className="bulk-variation-attachment">
                <label htmlFor={`bulk-variant-file-${index}`}>
                  {t('messageTester.bulkPersonalization.attachment')}
                </label>
                <input
                  id={`bulk-variant-file-${index}`}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                  disabled={!canWrite}
                  onChange={event => pickVariationFile(event, index)}
                />
                {variationFiles[index] && (
                  <span className="hint">
                    {variationFiles[index]?.filename}
                    {' '}
                    <button
                      type="button"
                      className="browse-btn"
                      disabled={!canWrite}
                      onClick={() => {
                        onVariationFilesChange(previous => {
                          const next = [...previous];
                          next[index] = null;
                          return next;
                        });
                        showAttachmentError('');
                      }}
                    >
                      {t('messageTester.bulkPersonalization.removeAttachment')}
                    </button>
                  </span>
                )}
              </div>
              <button
                type="button"
                className="browse-btn"
                disabled={!canWrite || variations.length <= 2}
                onClick={() => removeVariation(index)}
              >
                {t('messageTester.bulkPersonalization.remove')}
              </button>
            </div>
          ))}
          <div className="bulk-mode-header">
            <button
              type="button"
              className="browse-btn"
              disabled={!canWrite || variations.length >= MAX_BULK_VARIATIONS}
              onClick={() => {
                onVariationsChange([...variations, '']);
                onVariationFilesChange(previous => [...previous, null]);
              }}
            >
              {t('messageTester.bulkPersonalization.addVariation')}
            </button>
            <button type="button" className="browse-btn" disabled={!canWrite} onClick={saveVariations}>
              {t('messageTester.bulkPersonalization.save')}
            </button>
            <button type="button" className="browse-btn" disabled={!canWrite} onClick={removeSaved}>
              {t('messageTester.bulkPersonalization.clear')}
            </button>
          </div>
          <span className="hint">{t('messageTester.bulkPersonalization.browserOnly')}</span>
          <span className="hint">{t('messageTester.bulkPersonalization.attachmentHint')}</span>
          {attachmentError && (
            <div className="bulk-variation-attachment">
              <span className="hint error" role="alert">{attachmentError}</span>
              <button type="button" className="browse-btn" onClick={() => showAttachmentError('')}>
                {t('messageTester.bulkPersonalization.removeAttachment')}
              </button>
            </div>
          )}
          {saveMessage && <span className="hint" role="status">{saveMessage}</span>}
        </div>
      )}

      {mode !== 'same' && (
        <>
          {mode === 'personalized' && <p className="hint">{t('messageTester.bulkPersonalization.textOnly')}</p>}
          {error && <p className="hint error" role="alert">{errorText(t, error)}</p>}
          {!!preview.length && (
            <div className="bulk-preview">
              <strong>{t('messageTester.bulkPersonalization.preview', { count: preview.length })}</strong>
              <div className="bulk-preview-list">
                {preview.slice(0, 10).map((item, index) => (
                  <div className="bulk-preview-item" key={index}>
                    <span>{index + 1}. {item.chatId}</span>
                    <span>{item.content.text ?? item.content.caption}{item.type !== 'text' ? ` [${item.type}]` : ''}</span>
                  </div>
                ))}
              </div>
              {preview.length > 10 && <p className="hint">{t('messageTester.bulkPersonalization.previewMore', { count: preview.length - 10 })}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
