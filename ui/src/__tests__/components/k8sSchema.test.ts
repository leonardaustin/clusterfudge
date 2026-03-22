import { describe, it, expect } from 'vitest'
import {
  extractKind,
  validateTopLevelFields,
  getTopLevelFields,
  getSpecFields,
  getMetadataFields,
} from '@/components/editor/k8sSchema'

describe('k8sSchema', () => {
  describe('extractKind', () => {
    it('extracts kind from YAML text', () => {
      expect(extractKind('apiVersion: v1\nkind: Service\nmetadata:')).toBe('Service')
    })

    it('returns empty string when no kind found', () => {
      expect(extractKind('apiVersion: v1\nmetadata:')).toBe('')
    })

    it('handles kind with trailing whitespace', () => {
      expect(extractKind('kind: Deployment  ')).toBe('Deployment')
    })
  })

  describe('validateTopLevelFields', () => {
    it('returns empty array for valid Deployment fields', () => {
      const yaml = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: test\nspec:\n  replicas: 1'
      expect(validateTopLevelFields(yaml)).toEqual([])
    })

    it('returns diagnostics for unknown fields', () => {
      const yaml = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: test\nfoobar: invalid'
      const result = validateTopLevelFields(yaml)
      expect(result).toHaveLength(1)
      expect(result[0].field).toBe('foobar')
      expect(result[0].line).toBe(5)
    })

    it('returns empty array when no kind is present', () => {
      const yaml = 'apiVersion: v1\nfoo: bar'
      expect(validateTopLevelFields(yaml)).toEqual([])
    })

    it('validates ConfigMap with data field as valid', () => {
      const yaml = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test\ndata:\n  key: value'
      expect(validateTopLevelFields(yaml)).toEqual([])
    })

    it('validates Secret with type and stringData as valid', () => {
      const yaml = 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: test\ntype: Opaque\nstringData:\n  key: value'
      expect(validateTopLevelFields(yaml)).toEqual([])
    })

    it('flags unknown field on Secret', () => {
      const yaml = 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: test\nunknownField: val'
      const result = validateTopLevelFields(yaml)
      expect(result).toHaveLength(1)
      expect(result[0].field).toBe('unknownField')
    })
  })

  describe('getTopLevelFields', () => {
    it('returns fields for known kind', () => {
      const fields = getTopLevelFields('ConfigMap')
      expect(fields).toHaveProperty('data')
      expect(fields).toHaveProperty('apiVersion')
    })

    it('returns common fields for unknown kind', () => {
      const fields = getTopLevelFields('UnknownResource')
      expect(fields).toHaveProperty('apiVersion')
      expect(fields).toHaveProperty('kind')
      expect(fields).toHaveProperty('metadata')
      expect(fields).toHaveProperty('spec')
    })
  })

  describe('getSpecFields', () => {
    it('returns spec fields for Deployment', () => {
      const fields = getSpecFields('Deployment')
      expect(fields).toHaveProperty('replicas')
      expect(fields).toHaveProperty('selector')
      expect(fields).toHaveProperty('template')
    })

    it('returns spec fields for Service', () => {
      const fields = getSpecFields('Service')
      expect(fields).toHaveProperty('type')
      expect(fields).toHaveProperty('ports')
      expect(fields).toHaveProperty('selector')
    })

    it('returns empty object for unknown kind', () => {
      const fields = getSpecFields('UnknownKind')
      expect(Object.keys(fields)).toHaveLength(0)
    })
  })

  describe('getMetadataFields', () => {
    it('returns standard metadata fields', () => {
      const fields = getMetadataFields()
      expect(fields).toHaveProperty('name')
      expect(fields).toHaveProperty('namespace')
      expect(fields).toHaveProperty('labels')
      expect(fields).toHaveProperty('annotations')
    })
  })
})
