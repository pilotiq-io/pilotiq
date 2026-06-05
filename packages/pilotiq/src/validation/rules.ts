import { makeValidator, type Validator } from './Validator.js'

// `[]` (real array) and `'[]'` (the JSON-encoded empty-array wire shape
// multi-selects + TagsInput post through their hidden input) count as
// empty — validation runs BEFORE coercion, so the raw body string is
// what `required()` sees.
const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === ''
  || (Array.isArray(v) && v.length === 0)
  || v === '[]'

export function required(message = 'This field is required'): Validator {
  return makeValidator(
    v => (isEmpty(v) ? message : null),
    { rule: 'required', message },
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function email(message = 'Must be a valid email'): Validator {
  return makeValidator(
    v => {
      if (isEmpty(v)) return null
      if (typeof v !== 'string' || !EMAIL_RE.test(v)) return message
      return null
    },
    { rule: 'email', message },
  )
}

export function minLength(n: number, message = `Must be at least ${n} characters`): Validator {
  return makeValidator(
    v => {
      if (isEmpty(v)) return null
      if (typeof v !== 'string') return null
      return v.length < n ? message : null
    },
    { rule: 'minLength', value: n, message },
  )
}

export function maxLength(n: number, message = `Must be at most ${n} characters`): Validator {
  return makeValidator(
    v => {
      if (isEmpty(v)) return null
      if (typeof v !== 'string') return null
      return v.length > n ? message : null
    },
    { rule: 'maxLength', value: n, message },
  )
}

export function min(n: number, message = `Must be at least ${n}`): Validator {
  return makeValidator(
    v => {
      if (isEmpty(v)) return null
      if (typeof v !== 'number') return null
      return v < n ? message : null
    },
    { rule: 'min', value: n, message },
  )
}

export function max(n: number, message = `Must be at most ${n}`): Validator {
  return makeValidator(
    v => {
      if (isEmpty(v)) return null
      if (typeof v !== 'number') return null
      return v > n ? message : null
    },
    { rule: 'max', value: n, message },
  )
}

export function pattern(regex: RegExp, message = 'Invalid format'): Validator {
  return makeValidator(
    v => {
      if (isEmpty(v)) return null
      if (typeof v !== 'string') return null
      return regex.test(v) ? null : message
    },
    { rule: 'pattern', source: regex.source, flags: regex.flags, message },
  )
}
