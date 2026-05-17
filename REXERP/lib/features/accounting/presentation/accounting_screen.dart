import 'package:flutter/material.dart';

class AccountingScreen extends StatelessWidget {
  const AccountingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Muhasebe ve Finans',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            const Text('Kasa, banka, doviz, gider ve mutabakat ekranlari icin temel yerlesim.'),
            const SizedBox(height: 16),
            Table(
              border: TableBorder.all(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
              children: const [
                TableRow(
                  children: [
                    Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Panel'),
                    ),
                    Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Durum'),
                    ),
                  ],
                ),
                TableRow(
                  children: [
                    Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Kasa'),
                    ),
                    Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Planlandi'),
                    ),
                  ],
                ),
                TableRow(
                  children: [
                    Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Banka'),
                    ),
                    Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Planlandi'),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
