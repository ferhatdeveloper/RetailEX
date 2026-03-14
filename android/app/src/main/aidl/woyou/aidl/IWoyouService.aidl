package woyou.aidl;

import woyou.aidl.ITaskCallback;
import android.graphics.Bitmap;

/**
 * Sunmi Printer Service Interface
 */
interface IWoyouService {
	/**
	 * Get the service status
	 * @return 0: Success, 1: Error
	 */
	void updateFirmware();
	
	/**
	 * Printer status
	 * 1: Normal, 2: Under development, 3: Out of paper, 4: Overheated, 5: Not connected, 6: Error
	 */
	int getPrinterStatus();
	
	/**
	 * Printer initialization
	 * @param callback
	 */
	void printerInit(ITaskCallback callback);
	
	/**
	 * Character set setting
	 * @param charset
	 * @param callback
	 */
	void printerSelfChecking(ITaskCallback callback);
	
	/**
	 * Get printer serial number
	 */
	String getPrinterSerialNo();
	
	/**
	 * Get printer model
	 */
	String getPrinterModal();
	
	/**
	 * Set print density
	 */
	void setPrinterDensity(int density, ITaskCallback callback);
	
	/**
	 * Print text
	 * @param text
	 * @param callback
	 */
	void printText(String text, ITaskCallback callback);
	
	/**
	 * Print text with specified font size
	 * @param text
	 * @param fontSize
	 * @param callback
	 */
	void printTextWithFont(String text, String typeface, float fontSize, ITaskCallback callback);
	
	/**
	 * Print columns
	 * @param colsText
	 * @param colsWidth
	 * @param colsAlign
	 * @param callback
	 */
	void printColumnsText(in String[] colsText, in int[] colsWidth, in int[] colsAlign, ITaskCallback callback);
	
	/**
	 * Print bitmap
	 * @param bitmap
	 * @param callback
	 */
	void printBitmap(in Bitmap bitmap, ITaskCallback callback);
	
	/**
	 * Print barcode
	 * @param data
	 * @param symbology
	 * @param height
	 * @param width
	 * @param textpos
	 * @param callback
	 */
	void printBarCode(String data, int symbology, int height, int width, int textpos, ITaskCallback callback);
	
	/**
	 * Print QR code
	 * @param data
	 * @param modulesize
	 * @param errorlevel
	 * @param callback
	 */
	void printQRCode(String data, int modulesize, int errorlevel, ITaskCallback callback);
	
	/**
	 * Feed paper
	 * @param lines
	 * @param callback
	 */
	void lineWrap(int lines, ITaskCallback callback);
	
	/**
	 * Cut paper
	 */
	void cutPaper(ITaskCallback callback);
	
	/**
	 * Get printed length
	 */
	long getPrintedLength();
}
