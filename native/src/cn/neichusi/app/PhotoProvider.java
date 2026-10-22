package cn.neichusi.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** One-purpose camera output provider. It cannot expose preferences or other files. */
public final class PhotoProvider extends ContentProvider {
  public boolean onCreate(){return true;}
  private File target(Uri uri)throws FileNotFoundException {
    String name=uri.getLastPathSegment();
    if(name==null||!name.matches("camera-[a-f0-9-]+\\.jpg"))throw new FileNotFoundException();
    File directory=new File(getContext().getCacheDir(),"media");directory.mkdirs();
    return new File(directory,name);
  }
  public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {
    try{return ParcelFileDescriptor.open(target(uri),ParcelFileDescriptor.parseMode(mode));}catch(IllegalArgumentException error){throw new FileNotFoundException();}
  }
  public String getType(Uri uri){return "image/jpeg";}
  public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{File f=target(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{f.getName(),f.length()});return c;}catch(Exception e){return null;}}
  public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
  public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
  public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
}
