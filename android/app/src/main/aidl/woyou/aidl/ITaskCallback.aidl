package woyou.aidl;

/**
 * Printing callback interface
 */
interface ITaskCallback {
	/**
	 * Callback notification after a printing task is complete or fails
	 * @param isSuccess - whether the print was successful
	 * @param code - error code, 0 is success, others are error
	 * @param msg - descriptive message for failure
	 */
	oneway void onRunResult(boolean isSuccess, int code, String msg);
}
