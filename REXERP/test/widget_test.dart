import 'package:flutter_test/flutter_test.dart';
import 'package:rexerp/app/app.dart';

void main() {
  testWidgets('REXERP login ekrani render edilir', (tester) async {
    await tester.pumpWidget(const RexErpApp());
    expect(find.text('REXERP'), findsOneWidget);
    expect(find.text('Devam Et'), findsOneWidget);
  });
}
