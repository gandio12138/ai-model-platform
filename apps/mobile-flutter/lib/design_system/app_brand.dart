import 'package:flutter/material.dart';

class AppBrandLogo extends StatelessWidget {
  const AppBrandLogo({
    super.key,
    this.height = 42,
    this.semanticLabel = 'oToken',
  });

  final double height;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/icons/otoken_logo_monochrome.png',
      height: height,
      fit: BoxFit.contain,
      semanticLabel: semanticLabel,
    );
  }
}

class AppBrandIcon extends StatelessWidget {
  const AppBrandIcon({
    super.key,
    this.size = 58,
    this.semanticLabel = 'oToken',
  });

  final double size;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.22),
      child: Image.asset(
        'assets/icons/otoken_icon.png',
        width: size,
        height: size,
        fit: BoxFit.cover,
        semanticLabel: semanticLabel,
      ),
    );
  }
}
