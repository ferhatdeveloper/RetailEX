import 'package:flutter/material.dart';

class ManagementScreen extends StatelessWidget {
  const ManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Yonetim Modulu',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            const Text('Dashboard, urunler, musteriler, faturalar ve raporlar burada toplanacak.'),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: const [
                Chip(label: Text('Dashboard')),
                Chip(label: Text('Urunler')),
                Chip(label: Text('Musteriler')),
                Chip(label: Text('Faturalar')),
                Chip(label: Text('Raporlar')),
                Chip(label: Text('Kasa/Banka')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
