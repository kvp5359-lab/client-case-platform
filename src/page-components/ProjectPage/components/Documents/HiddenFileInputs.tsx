"use client"

import React, { memo } from 'react'

interface HiddenFileInputsProps {
  fileInputRef: React.Ref<HTMLInputElement>
  slotFileInputRef: React.Ref<HTMLInputElement>
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSlotFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  kitlessFileInputRef?: React.Ref<HTMLInputElement>
  onKitlessFileChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export const HiddenFileInputs = memo(function HiddenFileInputs({
  fileInputRef,
  slotFileInputRef,
  onFileChange,
  onSlotFileChange,
  kitlessFileInputRef,
  onKitlessFileChange,
}: HiddenFileInputsProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={onFileChange}
        className="hidden"
      />
      <input
        ref={slotFileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={onSlotFileChange}
        className="hidden"
      />
      {kitlessFileInputRef && onKitlessFileChange && (
        <input
          ref={kitlessFileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          className="hidden"
          onChange={onKitlessFileChange}
        />
      )}
    </>
  )
})
