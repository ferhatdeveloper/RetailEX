using TeraziRongta.Core.Helpers; using TeraziRongta.Core.Models;
class M { static void Main() {
  var p = new ScaleProductDto { Name="T", Barcode="1000000071", Price=7500, LfCode=99995 };
  var m = PluJsonMapper.MapProductToPluJson(p,1,10000,64,new ScalePluDefaults());
  var api = ScalePriceHelper.ReadUnitPrice(m["UnitPrice"]);
  var dev = ScalePriceHelper.ToDeviceUnitPrice(api,2,true);
  System.Console.WriteLine("raw="+m["UnitPrice"]+" api="+api+" dev="+dev);
  System.Console.WriteLine("code="+m["Code"]);
}}
