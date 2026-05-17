import 'package:flutter/material.dart';

class PosScreen extends StatelessWidget {
  const PosScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const _ModulePlaceholder(
      title: 'POS Modulu',
      description: 'MarketPOS ve MobilePOS ekran akislari bu bolumde olacak.',
      bullets: [
        'Sepet paneli',
        'Urun arama / barkod giris alani',
        'Odeme modal yapisi',
      ],
    );
  }
}

class _ModulePlaceholder extends StatelessWidget {
  const _ModulePlaceholder({
    required this.title,
    required this.description,
    required this.bullets,
  });

  final String title;
  final String description;
  final List<String> bullets;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            Text(description),
            const SizedBox(height: 16),
            ...bullets.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle_outline, size: 18),
                    const SizedBox(width: 8),
                    Text(item),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
