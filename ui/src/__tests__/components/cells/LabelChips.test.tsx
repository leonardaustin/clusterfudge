import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabelChips } from '@/components/cells/LabelChips'

describe('LabelChips', () => {
  it('renders dash for empty labels', () => {
    render(<LabelChips labels={{}} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renders all labels when within limit', () => {
    render(<LabelChips labels={{ app: 'nginx', env: 'prod' }} maxVisible={3} />)
    expect(screen.getByText('app')).toBeTruthy()
    expect(screen.getByText('nginx')).toBeTruthy()
    expect(screen.getByText('env')).toBeTruthy()
    expect(screen.getByText('prod')).toBeTruthy()
  })

  it('shows "+N more" when labels exceed maxVisible', () => {
    render(
      <LabelChips
        labels={{ a: '1', b: '2', c: '3', d: '4', e: '5' }}
        maxVisible={2}
      />
    )
    expect(screen.getByText('+3 more')).toBeTruthy()
  })

  it('expands on click', async () => {
    const user = userEvent.setup()
    render(
      <LabelChips
        labels={{ a: '1', b: '2', c: '3', d: '4' }}
        maxVisible={2}
      />
    )
    await user.click(screen.getByText('+2 more'))
    expect(screen.getByText('d')).toBeTruthy()
    expect(screen.getByText('less')).toBeTruthy()
  })

  it('collapses on "less" click', async () => {
    const user = userEvent.setup()
    render(
      <LabelChips
        labels={{ a: '1', b: '2', c: '3', d: '4' }}
        maxVisible={2}
      />
    )
    await user.click(screen.getByText('+2 more'))
    await user.click(screen.getByText('less'))
    expect(screen.getByText('+2 more')).toBeTruthy()
  })
})
