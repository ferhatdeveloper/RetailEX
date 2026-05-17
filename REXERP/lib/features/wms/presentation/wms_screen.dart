import 'package:flutter/material.dart';

class WmsScreen extends StatelessWidget {
  const WmsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'WMS Modulu',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            const Text('Depo alim, sevkiyat, stok sayim ve performans ekranlari icin iskelet alan.'),
            const SizedBox(height: 16),
            const LinearProgressIndicator(value: 0.15),
            const SizedBox(height: 8),
            const Text('UI tamamlama durumu: %15 (yalnizca iskelet)'),
          ],
        ),
      ),
    );
  }
}
