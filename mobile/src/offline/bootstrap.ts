import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useConnectivityStore } from '../store/connectivityStore';
import { flushPendingMutations } from '../offline/syncEngine';
import { shouldUseLiveData } from '../offline/policy';

let started = false;
let wasLive = false;

function applyNetInfo(state: NetInfoState) {
  const connected = state.isConnected;
  const reachable = state.isInternetReachable;
  useConnectivityStore.getState().setNetState(connected, reachable);

  const live = shouldUseLiveData();
  if (live && !wasLive) {
    void flushPendingMutations();
  }
  wasLive = live;
}

/** App boot: NetInfo dinle + başlangıç kuyruk sayımı / flush */
export function startConnectivityMonitoring(): () => void {
  if (started) {
    return () => undefined;
  }
  started = true;

  void useConnectivityStore.getState().refreshPendingCount();

  const unsub = NetInfo.addEventListener(applyNetInfo);
  void NetInfo.fetch().then(applyNetInfo);

  return () => {
    unsub();
    started = false;
  };
}
