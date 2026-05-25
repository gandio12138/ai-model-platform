import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

const _localNetworkChannel = MethodChannel('otoken/local_network');

Future<void> warmUpLocalNetworkPermission(String apiBaseUrl) async {
  if (!Platform.isIOS) return;

  final uri = Uri.tryParse(apiBaseUrl);
  if (uri == null || !_isPrivateLanHost(uri.host)) return;

  try {
    await _localNetworkChannel
        .invokeMethod<bool>('requestWirelessData', {'url': apiBaseUrl})
        .timeout(const Duration(milliseconds: 800));
  } catch (_) {
    // China-region iOS can show the WLAN/Cellular Data prompt only from a
    // real network request. This native URLSession probe is best-effort.
  }
}

Future<bool> openOTokenAppSettings() async {
  if (!Platform.isIOS) return false;
  try {
    return await _localNetworkChannel.invokeMethod<bool>('openSettings') ??
        false;
  } catch (_) {
    return false;
  }
}

bool _isPrivateLanHost(String host) {
  final parts = host.split('.').map(int.tryParse).toList();
  if (parts.length != 4 || parts.any((part) => part == null)) return false;
  final a = parts[0]!;
  final b = parts[1]!;
  return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168);
}
