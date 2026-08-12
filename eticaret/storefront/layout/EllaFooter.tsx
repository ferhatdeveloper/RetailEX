type Props = {
  tenantCode: string;
};

export function EllaFooter({ tenantCode }: Props) {
  return (
    <footer className="footer footer-default">
      <div className="container container-1170">
        <div className="footer-block__newsletter text-center" style={{ padding: '32px 0' }}>
          <h3 className="footer-block__heading uppercase">Bülten</h3>
          <p className="footer-block__text">Kampanya ve yeniliklerden haberdar olun.</p>
        </div>
        <div className="footer-copyright text-center" style={{ paddingBottom: 24 }}>
          <small>
            © {new Date().getFullYear()} {tenantCode.toUpperCase()} · RetailEX Online Satış
          </small>
        </div>
      </div>
    </footer>
  );
}
