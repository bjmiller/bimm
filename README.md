# Brian's Idiosyncratic Music Manager

This is an app intended to help sort through a large catalog of locally stored music files, and quickly select some to listen to.

It expects the files to be organized into folders, with one folder being an album.  The folders generally have a naming convention that looks like this:
```
${artist} - {album_title} (${year})
```

The app will filter and sort based on genre/style, artist, album title, and running time.  In general, we want to use the files themselves, along with their metadata, as the source of truth for our data.  We need to calculate the album running time from the individual files, and we need some help from the internet to obtain somewhat-accurate genre information.

This app is being built using electron, with the hope that it can run both on Windows and Mac.  (It should also run on Linux, but I'm not going to test it there.)
