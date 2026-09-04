// components/ReferralRewardWatcher.jsx
// Renders the ReferralRewardModal on top of whatever's underneath
// whenever a new unshown wallet credit is detected.
//
// Drop this once near the root of MainTabs (or anywhere with access
// to myUid) — it has no visual presence when the modal isn't open.

import { useState, useCallback } from 'react';
import ReferralRewardModal from './ReferralRewardModal';
import { useReferralRewardWatcher } from '../utils/useReferralRewardWatcher';

export default function ReferralRewardWatcher({ myUid, onViewWallet }) {
  const { pending, markShown } = useReferralRewardWatcher(myUid);

  const onClose = useCallback(() => {
    if (pending) markShown(pending);
  }, [pending, markShown]);

  return (
    <ReferralRewardModal
      visible={!!pending}
      amount={pending?.amount_ngn}
      onClose={onClose}
      onViewWallet={() => {
        if (pending) markShown(pending);
        onViewWallet?.();
      }}
    />
  );
}
