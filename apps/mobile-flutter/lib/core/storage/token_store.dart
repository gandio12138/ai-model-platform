import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenPair {
  const TokenPair({required this.accessToken, this.refreshToken});

  final String accessToken;
  final String? refreshToken;
}

abstract class TokenStore {
  Future<TokenPair?> read();
  Future<void> save(TokenPair token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessTokenKey = 'onetoken.access_token';
  static const _refreshTokenKey = 'onetoken.refresh_token';

  @override
  Future<TokenPair?> read() async {
    final accessToken = await _storage.read(key: _accessTokenKey);
    if (accessToken == null || accessToken.isEmpty) return null;
    return TokenPair(
      accessToken: accessToken,
      refreshToken: await _storage.read(key: _refreshTokenKey),
    );
  }

  @override
  Future<void> save(TokenPair token) async {
    await _storage.write(key: _accessTokenKey, value: token.accessToken);
    if (token.refreshToken != null) {
      await _storage.write(key: _refreshTokenKey, value: token.refreshToken);
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }
}

class MemoryTokenStore implements TokenStore {
  TokenPair? _token;

  @override
  Future<void> clear() async => _token = null;

  @override
  Future<TokenPair?> read() async => _token;

  @override
  Future<void> save(TokenPair token) async => _token = token;
}

abstract class ApiBaseStore {
  Future<String?> read();
  Future<void> save(String value);
  Future<void> clear();
}

class SecureApiBaseStore implements ApiBaseStore {
  SecureApiBaseStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _apiBaseUrlKey = 'onetoken.api_base_url';

  @override
  Future<String?> read() async {
    final value = await _storage.read(key: _apiBaseUrlKey);
    if (value == null || value.trim().isEmpty) return null;
    return value.trim();
  }

  @override
  Future<void> save(String value) async {
    await _storage.write(key: _apiBaseUrlKey, value: value.trim());
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _apiBaseUrlKey);
  }
}

class MemoryApiBaseStore implements ApiBaseStore {
  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> save(String value) async => _value = value.trim();

  @override
  Future<void> clear() async => _value = null;
}
