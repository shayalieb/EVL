import { LINK_EXPIRATION_OPTIONS } from '../lib/linkExpiration';

export default function LinkExpirationPicker({ value, onChange, label = 'Link expiration', allowNever = true, testId = 'link-expiration' }) {
  const options = allowNever ? LINK_EXPIRATION_OPTIONS : LINK_EXPIRATION_OPTIONS.filter((option) => option.value !== 'never');
  const preset = value?.preset || '7_days';

  return (
    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-600">{label}</legend>
      <select
        value={preset}
        onChange={(event) => onChange({ preset: event.target.value, expiresAt: event.target.value === 'custom' ? value?.expiresAt || '' : '' })}
        data-testid={`${testId}-preset-select`}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {preset === 'custom' && (
        <label className="mt-3 block text-xs font-semibold text-slate-500">
          Expiration date and time
          <input
            required
            type="datetime-local"
            value={value?.expiresAt || ''}
            onChange={(event) => onChange({ preset: 'custom', expiresAt: event.target.value })}
            data-testid={`${testId}-custom-input`}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {preset === 'never' ? 'This link remains available until it is used, completed, replaced, or manually revoked.' : 'The recipient will lose access after this time unless you extend or replace the link.'}
      </p>
    </fieldset>
  );
}
