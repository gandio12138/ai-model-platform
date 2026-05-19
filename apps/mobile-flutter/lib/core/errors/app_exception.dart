class AppException implements Exception {
  const AppException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;
  final String? code;

  @override
  String toString() => message;
}

String errorMessage(Object error) {
  if (error is AppException) return error.message;
  return '请求失败，请检查网络后重试';
}
