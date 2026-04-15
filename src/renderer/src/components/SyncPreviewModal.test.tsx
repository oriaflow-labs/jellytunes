// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { SyncPreviewModal } from './SyncPreviewModal'
import type { PreviewData, Bitrate } from '../appTypes'

const mockApi = {
  listUsbDevices: vi.fn().mockResolvedValue([]),
  getDeviceInfo: vi.fn().mockResolvedValue({ total: 32e9, free: 16e9, used: 16e9 }),
  getFilesystem: vi.fn().mockResolvedValue('exfat'),
  getSyncedItems: vi.fn().mockResolvedValue([]),
  analyzeDiff: vi.fn().mockResolvedValue({ success: true, items: [] }),
  estimateSize: vi.fn().mockResolvedValue({ trackCount: 0, totalBytes: 0, formatBreakdown: {} }),
  startSync2: vi.fn().mockResolvedValue({ success: true, tracksCopied: 10, tracksSkipped: 5, errors: [] }),
  removeItems: vi.fn().mockResolvedValue({ removed: 0, errors: [] }),
  cancelSync: vi.fn().mockResolvedValue({ cancelled: true }),
  onSyncProgress: vi.fn().mockReturnValue(() => {}),
  getDeviceSyncInfo: vi.fn().mockResolvedValue(null),
  selectFolder: vi.fn().mockResolvedValue('/mnt/usb'),
  saveSession: vi.fn().mockResolvedValue(undefined),
  loadSession: vi.fn().mockResolvedValue(null),
  clearSession: vi.fn().mockResolvedValue(undefined),
}
beforeAll(() => { Object.defineProperty(window, 'api', { value: mockApi, writable: true }) })
afterEach(() => { vi.resetAllMocks() })

const samplePreviewData: PreviewData = {
  trackCount: 150,
  totalBytes: 5_000_000_000, // ~5 GB
  formatBreakdown: { flac: 3_000_000_000, mp3: 2_000_000_000 },
  alreadySyncedCount: 25,
  willRemoveCount: 0,
}

const defaultProps = {
  data: samplePreviewData,
  convertToMp3: false,
  bitrate: '320k' as Bitrate,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
}

describe('SyncPreviewModal', () => {
  // 1. shows trackCount and totalBytes formatted
  it('shows formatted track count and total size', () => {
    render(<SyncPreviewModal {...defaultProps} />)
    expect(screen.getByTestId('preview-track-count')).toHaveTextContent('150')
    expect(screen.getByTestId('preview-total-size')).toHaveTextContent('4.66 GB')
  })

  // 2. shows "will remove" count only if willRemoveCount > 0
  it('shows will remove count only when willRemoveCount is greater than 0', () => {
    const dataWithRemove: PreviewData = { ...samplePreviewData, willRemoveCount: 5 }
    render(<SyncPreviewModal {...defaultProps} data={dataWithRemove} />)
    expect(screen.getByText(/Will remove from device/)).toBeInTheDocument()
    expect(screen.getByText(/5 item\(s\)/)).toBeInTheDocument()
  })

  it('does not show will remove section when willRemoveCount is 0', () => {
    render(<SyncPreviewModal {...defaultProps} />)
    expect(screen.queryByText(/Will remove from device/)).not.toBeInTheDocument()
  })

  // 3. shows MP3 conversion info only if convertToMp3 = true
  it('shows MP3 conversion info when convertToMp3 is true', () => {
    render(<SyncPreviewModal {...defaultProps} convertToMp3={true} />)
    expect(screen.getByText(/FLAC\/lossless and other formats → MP3 320k/)).toBeInTheDocument()
  })

  it('does not show MP3 conversion info when convertToMp3 is false', () => {
    render(<SyncPreviewModal {...defaultProps} convertToMp3={false} />)
    expect(screen.queryByText(/FLAC\/lossless/)).not.toBeInTheDocument()
  })

  // 4. confirm calls onConfirm, cancel calls onCancel
  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(<SyncPreviewModal {...defaultProps} />)
    const confirmButton = screen.getByTestId('confirm-sync-button')
    await user.click(confirmButton)
    expect(defaultProps.onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(<SyncPreviewModal {...defaultProps} />)
    const cancelButton = screen.getByTestId('cancel-preview-button')
    await user.click(cancelButton)
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })
})
