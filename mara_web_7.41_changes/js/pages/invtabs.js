/* انبارگردانی یک عنوان در منوست با دو زبانه: «شروع انبارگردانی» و «گزارش انبارگردانی» */
import { tabsBar } from '../ui.js';
export const invTabs = active => tabsBar([{ id: 'monthcount', label: 'شروع انبارگردانی' }, { id: 'stocktake', label: 'گزارش انبارگردانی' }], active, id => { location.hash = '#/' + id; });
