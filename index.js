require('dotenv').config(); // Load environment variables from .env file
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const http = require('http');;
const bodyParser = require('body-parser');
const multer = require("multer");
const xlsx = require('xlsx');

const fsSync = require("fs");
const fs = require("fs").promises;
const path = require("path");
const archiver = require("archiver");

// Database configuration
const dbConfig = {
  user: 'sa',
  password: 'Itjx2025!',
  server: '153.92.5.18',
  database: 'JX2HRD',
  options: {
    encrypt: false, // for Azure
    requestTimeout: 60000,
  },
};

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// JWT secret key from .env
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is not defined. Please set it in the .env file.');
  process.exit(1);
}

app.post('/login', async (req, res) => {
  const { nik, password } = req.body;

  if (!nik || !password) {
    return res.status(400).json({ message: 'NIK and password are required.' });
  }

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Query the database to find the user
    const result = await pool
      .request()
      .input('nik', sql.VarChar, nik)
      .input('password', sql.VarChar, password)
      .query(
        'SELECT TOP 1 [NIK], [NamaLengkap], [Email] FROM [dbo].[MAIN_USER_DATA] WHERE [NIK] = @nik AND [Password] = @password'
      );

    // Check if user exists
    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Invalid NIK or password.' });
    }

    const user = result.recordset[0];

    // Create a JWT token
    const token = jwt.sign(
      {
        userId: user.NIK,
        email: user.Email,
        name: user.NamaLengkap,
      },
      JWT_SECRET,
      { expiresIn: '1h' } // Token valid for 1 hour
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.NIK,
        name: user.NamaLengkap,
        email: user.Email,
      },
    });
  } catch (error) {
    console.error('Database query error:', error.message);
    res.status(500).json({ message: 'An error occurred during login.' });
  }
});

app.post('/loginAdmin', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Query the database to find the user
    const result = await pool
      .request()
      .input('username', sql.VarChar, username)
      .query(
        'SELECT TOP 1 [id], [username], [password], [role] FROM [dbo].[USER_ADMIN] WHERE [username] = @username'
      );

    // Check if user exists
    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = result.recordset[0];

    // Verify the password (assuming it's stored as plaintext for simplicity)
    // If passwords are hashed, compare using a library like bcrypt
    if (user.password !== password) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Create a JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '1h' } // Token valid for 1 hour
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Database query error:', error.message);
    res.status(500).json({ message: 'An error occurred during login.' });
  }
});

app.post('/getUserDataByNIK', async (req, res) => {
  const { NIK } = req.body;

  if (!NIK) {
    return res.status(400).send('NIK is required.');
  }

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Query to fetch data based on NIK
    const query = `
      SELECT [NIK] AS 'NIK',
             [NOKK] AS 'NO KK',
             [NamaLengkap] AS 'Nama Lengkap',
             [TempatLahir] AS 'Tempat Lahir',
             [TanggalLahir] AS 'Tanggal Lahir',
             [JenisKelamin] AS 'Jenis Kelamin',
             [Agama] AS 'Agama',
             [NoHandphone2] AS 'No Whatsapp',
             [NoHandphone] AS 'No Handphone',
             [Email] AS 'Email',
             [Kewarganegaraan] AS 'Kewarganegaraan',
             [AlamatLengkap] AS 'Alamat Lengkap',
             [Provinsi] AS 'Provinsi',
             [KabKota] AS 'Kab/Kota',
             [Kecamatan] AS 'Kecamatan',
             [Desa] AS 'Desa',
             [RT] AS 'RT',
             [RW] AS 'RW',
             [KodePos] AS 'Kode Pos',
             [AlamatDomisili] AS 'Alamat Domisili',
             [StatusPernikahan] AS 'Status Pernikahan',
             [PendidikanTerakhir] AS 'Pendidikan Terakhir',
             [NamaSekolah] AS 'Nama Sekolah',
             [Fakultas] AS 'Fakultas',
             [Jurusan] AS 'Jurusan',
             [Skill] AS 'Skill',
             [CatatanDisabilitas] AS 'Catatan Disabilitas',
             [Password] AS 'Password'
      FROM [MAIN_USER_DATA]
      WHERE [NIK] = @NIK
    `;

    // Prepare the SQL request
    const request = pool.request();
    request.input('NIK', sql.VarChar, NIK);

    // Execute the query
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return res.status(404).send('Data not found for the provided NIK.');
    }

    // Send the result back to the client
    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).send('An error occurred while retrieving data.');
  }
});

app.put('/updateUserData', async (req, res) => {
  const {
    NIK, // NIK digunakan untuk pencarian data
    "NO KK": NOKK,
    "Nama Lengkap": NamaLengkap,
    "Tempat Lahir": TempatLahir,
    "Tanggal Lahir": TanggalLahir,
    "Jenis Kelamin": JenisKelamin,
    "Agama": Agama,
    "No Whatsapp": NoHandphone2,
    "No Handphone": NoHandphone,
    "Email": Email,
    "Kewarganegaraan": Kewarganegaraan,
    "Alamat Lengkap": AlamatLengkap,
    "Provinsi": Provinsi,
    "Kab/Kota": KabKota,
    "Kecamatan": Kecamatan,
    "Desa": Desa,
    "RT": RT,
    "RW": RW,
    "Kode Pos": KodePos,
    "Alamat Domisili": AlamatDomisili,
    "Status Pernikahan": StatusPernikahan,
    "Pendidikan Terakhir": PendidikanTerakhir,
    "Nama Sekolah": NamaSekolah,
    "Fakultas": Fakultas,
    "Jurusan": Jurusan,
    "Skill": Skill,
    "Catatan Disabilitas": CatatanDisabilitas,
    "Password": Password,
  } = req.body;

  if (!NIK) {
    return res.status(400).send('NIK is required.');
  }

  try {
    const pool = await sql.connect(dbConfig);

    const query = `
      UPDATE [MAIN_USER_DATA]
      SET [NOKK] = @NOKK,
          [NamaLengkap] = @NamaLengkap,
          [TempatLahir] = @TempatLahir,
          [TanggalLahir] = @TanggalLahir,
          [JenisKelamin] = @JenisKelamin,
          [Agama] = @Agama,
          [NoHandphone2] = @NoHandphone2,
          [NoHandphone] = @NoHandphone,
          [Email] = @Email,
          [Kewarganegaraan] = @Kewarganegaraan,
          [AlamatLengkap] = @AlamatLengkap,
          [Provinsi] = @Provinsi,
          [KabKota] = @KabKota,
          [Kecamatan] = @Kecamatan,
          [Desa] = @Desa,
          [RT] = @RT,
          [RW] = @RW,
          [KodePos] = @KodePos,
          [AlamatDomisili] = @AlamatDomisili,
          [StatusPernikahan] = @StatusPernikahan,
          [PendidikanTerakhir] = @PendidikanTerakhir,
          [NamaSekolah] = @NamaSekolah,
          [Fakultas] = @Fakultas,
          [Jurusan] = @Jurusan,
          [Skill] = @Skill,
          [CatatanDisabilitas] = @CatatanDisabilitas,
          [Password] = @Password
      WHERE [NIK] = @NIK
    `;

    const request = pool.request();
    request.input('NIK', sql.VarChar, NIK);
    request.input('NOKK', sql.VarChar, NOKK);
    request.input('NamaLengkap', sql.VarChar, NamaLengkap);
    request.input('TempatLahir', sql.VarChar, TempatLahir);
    request.input('TanggalLahir', sql.Date, TanggalLahir);
    request.input('JenisKelamin', sql.VarChar, JenisKelamin);
    request.input('Agama', sql.VarChar, Agama);
    request.input('NoHandphone2', sql.VarChar, NoHandphone2);
    request.input('NoHandphone', sql.VarChar, NoHandphone);
    request.input('Email', sql.VarChar, Email);
    request.input('Kewarganegaraan', sql.VarChar, Kewarganegaraan);
    request.input('AlamatLengkap', sql.VarChar, AlamatLengkap);
    request.input('Provinsi', sql.VarChar, Provinsi);
    request.input('KabKota', sql.VarChar, KabKota);
    request.input('Kecamatan', sql.VarChar, Kecamatan);
    request.input('Desa', sql.VarChar, Desa);
    request.input('RT', sql.VarChar, RT);
    request.input('RW', sql.VarChar, RW);
    request.input('KodePos', sql.VarChar, KodePos);
    request.input('AlamatDomisili', sql.VarChar, AlamatDomisili);
    request.input('StatusPernikahan', sql.VarChar, StatusPernikahan);
    request.input('PendidikanTerakhir', sql.VarChar, PendidikanTerakhir);
    request.input('NamaSekolah', sql.VarChar, NamaSekolah);
    request.input('Fakultas', sql.VarChar, Fakultas);
    request.input('Jurusan', sql.VarChar, Jurusan);
    request.input('Skill', sql.VarChar, Skill);
    request.input('CatatanDisabilitas', sql.VarChar, CatatanDisabilitas);
    request.input('Password', sql.VarChar, Password);

    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).send('Data not found for the provided NIK.');
    }

    res.send('User data updated successfully.');
  } catch (error) {
    console.error('Database update error:', error);
    res.status(500).send('An error occurred while updating data.');
  }
});

app.get('/getProvinces', async (req, res) => {
  try {
    // Establish database connection
    const pool = await sql.connect(dbConfig);

    // Run query to fetch data
    const result = await pool.request().query('SELECT [id], [name] FROM [dbo].[PROVINSI_DATA]');

    // Send response with data
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).send('Server error');
  }
});

app.get('/getKabKota', async (req, res) => {
  try {
    // Get the province_id from the query parameters
    const { province_id } = req.query;

    if (!province_id) {
      return res.status(400).send('province_id is required');
    }
    const pool = await sql.connect(dbConfig);

    // Run query to fetch data with the provided province_id
    const result = await pool.request()
      .input('province_id', sql.Int, province_id)  // Prevent SQL Injection by using parameterized queries
      .query('SELECT [id], [province_id], [name] FROM [dbo].[KABKOTA_DATA] WHERE [province_id] = @province_id');

    // Send response with data
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).send('Server error');
  }
});

app.post('/getKecamatan', async (req, res) => {
  try {
    const { KabKotaId } = req.body;

    if (!KabKotaId) {
      return res.status(400).json({ error: 'KabKotaId is required' });
    }

    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('KabKotaId', sql.Char, KabKotaId) // Menggunakan parameterized query untuk mencegah SQL Injection
      .query(`
        SELECT [id], [KabKotaId], [NamaKecamatan]
        FROM [JX2HRD].[dbo].[KECAMATAN_DATA]
        WHERE [KabKotaId] = @KabKotaId
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    sql.close();
  }
});

app.post('/getDesa', async (req, res) => {
  try {
    const { KecamatanId } = req.body;

    if (!KecamatanId) {
      return res.status(400).json({ error: 'KabKotaId is required' });
    }

    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('KecamatanId', sql.Char, KecamatanId) // Menggunakan parameterized query untuk mencegah SQL Injection
      .query(`
        SELECT [Id] ,[KecamatanId],[NamaDesa]
        FROM [JX2HRD].[dbo].[DESA_DATA]
        WHERE [KecamatanId] = @KecamatanId
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    sql.close();
  }
});

app.post('/getJobVacanciesUser', async (req, res) => {
  try {
    const { NIK } = req.body; // Ambil NIK dari body request
    const pool = await sql.connect(dbConfig);

    let query;

    if (NIK) {
      // Jika NIK ada, gabungkan dengan tabel CANDIDATE_APPLIES
      query = `
        SELECT 
          JV.[JobId], 
          JV.[JobName], 
          JV.[Kualifikasi], 
          JV.[JobDescription], 
          JV.[JobCategory], 
          JV.[PostedDate], 
          JV.[ClosingDate], 
          JV.[IsActive], 
          CASE 
            WHEN CA.[JobId] IS NOT NULL THEN 'Sudah Dilamar'
            ELSE 'Belum Dilamar' 
          END AS [Status]
        FROM [dbo].[JOB_VACANCIES_DATA] JV
        LEFT JOIN (
          SELECT [JobId]
          FROM [JX2HRD].[dbo].[CANDIDATE_APPLIES]
          WHERE [NIK] = @NIK
        ) CA ON JV.[JobId] = CA.[JobId]
      `;
    } else {
      // Jika NIK tidak ada, tambahkan kolom Status dengan isi 'Belum Dilamar' untuk semua baris
      query = `
        SELECT 
          [JobId], 
          [JobName], 
          [Kualifikasi], 
          [JobDescription],
          [JobCategory], 
          [PostedDate], 
          [ClosingDate], 
          [IsActive], 
          'Belum Dilamar' AS [Status]
        FROM [dbo].[JOB_VACANCIES_DATA]
      `;
    }

    const request = pool.request();

    if (NIK) {
      // Tambahkan parameter NIK jika ada
      request.input('NIK', sql.VarChar, NIK);
    }

    const result = await request.query(query);

    // Ubah format tanggal menjadi string
    const formattedData = result.recordset.map(row => {
      const formatDate = dateStr => {
        if (!dateStr) return null; // Jika nilai kosong, kembalikan null
        const date = new Date(dateStr); // Pastikan nilai diubah ke Date object
        if (isNaN(date)) return null; // Jika bukan valid Date, kembalikan null
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = [
          'January', 'February', 'March', 'April', 'May',
          'June', 'July', 'August', 'September', 'October', 'November', 'December'
        ][date.getUTCMonth()];
        const year = date.getUTCFullYear();
        return `${day} ${month} ${year}`;
      };

      return {
        ...row,
        PostedDate: formatDate(row.PostedDate),
        ClosingDate: formatDate(row.ClosingDate),
      };
    });

    // Kirim hasil query yang telah diformat ke client
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching job vacancies:', error);
    res.status(500).json({ error: 'An error occurred while fetching job vacancies.' });
  }
});

app.post("/registUser", async (req, res) => {
  try {
    const {
      NIK,
      NamaLengkap,
      JenisKelamin,
      AlamatLengkap,
      KabKota,
      Provinsi,
      AlamatDomisili,
      PendidikanTerakhir,
      NamaSekolah,
      Jurusan,
      NoHandphone,
      Email,
      Skill,
      Password,
      KodePos,
      TanggalLahir,
      NOKK,
      TempatLahir,
      Agama,
      NoHandphone2,
      Kewarganegaraan,
      RT,
      RW,
      Kecamatan,
      Desa,
      StatusPernikahan,
      CatatanDisabilitas,
      Fakultas,
    } = req.body;

    // Validasi data wajib secara spesifik
    if (!NIK) return res.status(400).json({ message: "NIK tidak lengkap." });
    if (!NamaLengkap) return res.status(400).json({ message: "Nama Lengkap tidak lengkap." });
    if (!Password) return res.status(400).json({ message: "Password tidak lengkap." });
    if (!JenisKelamin) return res.status(400).json({ message: "Jenis Kelamin tidak lengkap." });
    if (!AlamatLengkap) return res.status(400).json({ message: "Alamat Lengkap tidak lengkap." });
    if (!KabKota) return res.status(400).json({ message: "Kab/Kota tidak lengkap." });
    if (!Provinsi) return res.status(400).json({ message: "Provinsi tidak lengkap." });
    if (!PendidikanTerakhir) return res.status(400).json({ message: "Pendidikan Terakhir tidak lengkap." });
    if (!NamaSekolah) return res.status(400).json({ message: "Nama Sekolah tidak lengkap." });
    if (!NoHandphone) return res.status(400).json({ message: "No Handphone tidak lengkap." });
    if (!Email) return res.status(400).json({ message: "Email tidak lengkap." });
    if (!Skill) return res.status(400).json({ message: "Skill tidak lengkap." });
    if (!KodePos) return res.status(400).json({ message: "Kode Pos tidak lengkap." });
    if (!TanggalLahir) return res.status(400).json({ message: "Tanggal Lahir tidak lengkap." });
    if (!NOKK) return res.status(400).json({ message: "No KK tidak lengkap." });
    if (!TempatLahir) return res.status(400).json({ message: "Tempat Lahir tidak lengkap." });
    if (!Agama) return res.status(400).json({ message: "Agama tidak lengkap." });
    if (!Kewarganegaraan) return res.status(400).json({ message: "Kewarganegaraan tidak lengkap." });
    if (!RT) return res.status(400).json({ message: "RT tidak lengkap." });
    if (!RW) return res.status(400).json({ message: "RW tidak lengkap." });
    if (!Kecamatan) return res.status(400).json({ message: "Kecamatan tidak lengkap." });
    if (!Desa) return res.status(400).json({ message: "Desa tidak lengkap." });
    if (!StatusPernikahan) return res.status(400).json({ message: "Status Pernikahan tidak lengkap." });
    if (!Fakultas) return res.status(400).json({ message: "Fakultas tidak lengkap." });

    // Koneksi ke database
    const pool = await sql.connect(dbConfig);

    // Periksa apakah NIK sudah ada
    const checkQuery = `SELECT COUNT(*) AS count FROM MAIN_USER_DATA WHERE NIK = @NIK`;
    const checkResult = await pool
      .request()
      .input("NIK", sql.VarChar, NIK)
      .query(checkQuery);

    const nikExists = checkResult.recordset[0].count > 0;

    // Jika NIK ada, hapus data terkait
    if (nikExists) {
      const deleteQuery = `DELETE FROM MAIN_USER_DATA WHERE NIK = @NIK`;
      await pool.request().input("NIK", sql.VarChar, NIK).query(deleteQuery);
    }

    // Query untuk menambahkan data baru
    const query = `
      INSERT INTO MAIN_USER_DATA (
        NIK, NamaLengkap, JenisKelamin, AlamatLengkap, KabKota, Provinsi, AlamatDomisili,
        PendidikanTerakhir, NamaSekolah, Jurusan, NoHandphone, Email, Skill, 
        Password, KodePos, TanggalLahir, NOKK, TempatLahir, Agama, NoHandphone2,
        Kewarganegaraan, RT, RW, Kecamatan, Desa, StatusPernikahan, CatatanDisabilitas, Fakultas
      ) VALUES (
        @NIK, @NamaLengkap, @JenisKelamin, @AlamatLengkap, @KabKota, @Provinsi, @AlamatDomisili,
        @PendidikanTerakhir, @NamaSekolah, @Jurusan, @NoHandphone, @Email, @Skill, 
        @Password, @KodePos, @TanggalLahir, @NOKK, @TempatLahir, @Agama, @NoHandphone2,
        @Kewarganegaraan, @RT, @RW, @Kecamatan, @Desa, @StatusPernikahan, @CatatanDisabilitas, @Fakultas
      )
    `;

    await pool
      .request()
      .input("NIK", sql.VarChar, NIK)
      .input("NamaLengkap", sql.VarChar, NamaLengkap)
      .input("JenisKelamin", sql.VarChar, JenisKelamin)
      .input("AlamatLengkap", sql.VarChar, AlamatLengkap)
      .input("KabKota", sql.VarChar, KabKota)
      .input("Provinsi", sql.VarChar, Provinsi)
      .input("AlamatDomisili", sql.VarChar, AlamatDomisili)
      .input("PendidikanTerakhir", sql.VarChar, PendidikanTerakhir)
      .input("NamaSekolah", sql.VarChar, NamaSekolah)
      .input("Jurusan", sql.VarChar, Jurusan)
      .input("NoHandphone", sql.VarChar, NoHandphone)
      .input("Email", sql.VarChar, Email)
      .input("Skill", sql.VarChar, Skill)
      .input("Password", sql.VarChar, Password) // Simpan password yang di-hash
      .input("KodePos", sql.VarChar, KodePos)
      .input("TanggalLahir", sql.Date, TanggalLahir)
      .input("NOKK", sql.VarChar, NOKK)
      .input("TempatLahir", sql.VarChar, TempatLahir)
      .input("Agama", sql.VarChar, Agama)
      .input("NoHandphone2", sql.VarChar, NoHandphone2)
      .input("Kewarganegaraan", sql.VarChar, Kewarganegaraan)
      .input("RT", sql.VarChar, RT)
      .input("RW", sql.VarChar, RW)
      .input("Kecamatan", sql.VarChar, Kecamatan)
      .input("Desa", sql.VarChar, Desa)
      .input("StatusPernikahan", sql.VarChar, StatusPernikahan)
      .input("CatatanDisabilitas", sql.Text, CatatanDisabilitas)
      .input("Fakultas", sql.VarChar, Fakultas)
      .query(query);

    res.status(200).json({ message: "Data berhasil disimpan." });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
});

app.post('/insertRiwayatPekerjaan', async (req, res) => {
  const { NIK, NamaPerusahaan, Jabatan, Departemen, MulaiKerja, TerakhirKerja } = req.body;

  try {
    // Connect to the database
    await sql.connect(dbConfig);

    // Insert data into the table
    const query = `
      INSERT INTO [dbo].[RIWAYAT_KERJA_USER_DATA]
      ([NIK], [NamaPerusahaan], [Jabatan], [Departemen], [MulaiKerja], [TerakhirKerja])
      VALUES
      (@NIK, @NamaPerusahaan, @Jabatan, @Departemen, @MulaiKerja, @TerakhirKerja)
    `;

    const request = new sql.Request();
    request.input('NIK', sql.VarChar, NIK);
    request.input('NamaPerusahaan', sql.VarChar, NamaPerusahaan);
    request.input('Jabatan', sql.VarChar, Jabatan);
    request.input('Departemen', sql.VarChar, Departemen);
    request.input('MulaiKerja', sql.Date, MulaiKerja);
    request.input('TerakhirKerja', sql.Date, TerakhirKerja);

    // Execute the query
    await request.query(query);

    // Respond with success
    res.status(201).json({ message: 'Data inserted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const storageDokumen = multer.diskStorage({
  destination: function (req, file, cb) {
    const { fieldname } = file;

    let folder;
    if (fieldname === 'dokumen') folder = 'data/Dokumen';

    cb(null, folder);
  },
  filename: function (req, file, cb) {
    const { nik } = req.body;

    if (!nik) {
      return cb(new Error('NIK tidak ditemukan!'), null);
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.pdf', '.jpg', '.png'];
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error('Hanya file dengan format PDF, JPG, atau PNG yang diperbolehkan!'));
    }

    const newName = `${nik}_dokumen${ext}`;
    cb(null, newName);
  },
});

const uploadDokumen = multer({
  storage: storageDokumen,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file dengan format PDF, JPG, atau PNG yang diperbolehkan!'));
    }
  },
}).single('dokumen');

app.post('/uploadDokumen', (req, res) => {
  uploadDokumen(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    const { nik } = req.body;
    if (!nik) return res.status(400).json({ message: 'NIK wajib diisi' });

    try {
      const pool = await sql.connect(dbConfig);

      const folderPath = path.join(__dirname, 'data/Dokumen');

      // Hapus file dokumen yang sudah ada untuk NIK tersebut
      try {
        const files = await fs.promises.readdir(folderPath);

        for (const file of files) {
          if (file.startsWith(`${nik}_`)) {
            const filePath = path.join(folderPath, file);
            console.log(`Menghapus file: ${filePath}`); // Debugging untuk memastikan file yang dihapus
            await fs.promises.unlink(filePath);
          }
        }
      } catch (readErr) {
        console.error(`Tidak dapat membaca folder ${folderPath}: ${readErr.message}`);
      }

      // Hapus data lama dari database
      const deleteQuery = 'DELETE FROM DOKUMEN_TAMBAHAN_USER_DATA WHERE NIK = @nik';
      await pool.request().input('nik', sql.VarChar, nik).query(deleteQuery);

      // Proses upload file baru
      const dokumen = req.file ? req.file.filename : null;

      // Insert data baru ke tabel
      const insertQuery = `
        INSERT INTO DOKUMEN_TAMBAHAN_USER_DATA (NIK, Dokumen)
        VALUES (@nik, @dokumen)
      `;
      await pool.request()
        .input('nik', sql.VarChar, nik)
        .input('dokumen', sql.VarChar, dokumen)
        .query(insertQuery);

      res.status(200).json({ message: 'Dokumen berhasil diunggah dan disimpan di database.' });
    } catch (dbErr) {
      console.error('Kesalahan pada server database:', dbErr);
      res.status(500).json({ message: 'Kesalahan pada server database.' });
    }
  });
});

app.post('/addCandidateApplied', async (req, res) => {
  const { NIK, JobId } = req.body;

  // Validate request body
  if (!NIK || !JobId) {
    return res.status(400).json({ error: 'Missing required fields: NIK, JobId' });
  }

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Query to insert data
    const query = `
      INSERT INTO [dbo].[CANDIDATE_APPLIES] ([NIK], [JobId], [Date], [Status], [Sub_Status])
      VALUES (@NIK, @JobId, GETDATE(), 'Screening CV', 'No status')
    `;

    // Execute the query
    await pool.request()
      .input('NIK', sql.VarChar, NIK)
      .input('JobId', sql.Int, JobId)
      .query(query);

    res.status(201).json({ message: 'Data inserted successfully!' });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Failed to insert data' });
  } finally {
    // Close the connection
    sql.close();
  }
});

// ADMIN

app.post('/getUserData', async (req, res) => {
  const { KabKota, Provinsi, PendidikanTerakhir, NamaSekolah, Jurusan } = req.body;

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Base query with aliases for column names
    let query = `SELECT [NIK] AS 'NIK',
                        [NOKK] AS 'NO KK',
                        [NamaLengkap] AS 'Nama Lengkap',
                        [TempatLahir] AS 'Tempat Lahir',
                        [TanggalLahir] AS 'Tanggal Lahir',
                        [JenisKelamin] AS 'Jenis Kelamin',
                        [Agama] AS 'Agama',
                        [NoHandphone2] AS 'No Whatsapp',
                        [NoHandphone] AS 'No Handphone',
                        [Email] AS 'Email',
                        [Kewarganegaraan] AS 'Kewarganegaraan',
                        [AlamatLengkap] AS 'Alamat Lengkap',
                        [Provinsi] AS 'Provinsi',
                        [KabKota] AS 'Kab/Kota',
                        [Kecamatan] AS 'Kecamatan',
                        [Desa] AS 'Desa',
                        [RT] AS 'RT',
                        [RW] AS 'RW',
                        [KodePos] AS 'Kode Pos',
                        [AlamatDomisili] AS 'Alamat Domisili',
                        [StatusPernikahan] AS 'Status Pernikahan',
                        [PendidikanTerakhir] AS 'Pendidikan Terakhir',
                        [NamaSekolah] AS 'Nama Sekolah',
                        [Fakultas] AS 'Fakultas',
                        [Jurusan] AS 'Jurusan',
                        [Skill] AS 'Skill',
                        [CatatanDisabilitas] AS 'Catatan Disabilitas',
                        [Password] AS 'Password'
                 FROM [MAIN_USER_DATA]`;

    // Add filters dynamically
    if (KabKota) {
      query += ` AND [KabKota] = @KabKota`;
    }
    if (Provinsi) {
      query += ` AND [Provinsi] = @Provinsi`;
    }
    if (PendidikanTerakhir) {
      query += ` AND [PendidikanTerakhir] = @PendidikanTerakhir`;
    }
    if (NamaSekolah) {
      query += ` AND [NamaSekolah] = @NamaSekolah`;
    }
    if (Jurusan) {
      query += ` AND [Jurusan] = @Jurusan`;
    }

    // Prepare the SQL request
    const request = pool.request();
    if (KabKota) request.input('KabKota', sql.VarChar, KabKota);
    if (Provinsi) request.input('Provinsi', sql.VarChar, Provinsi);
    if (PendidikanTerakhir) request.input('PendidikanTerakhir', sql.VarChar, PendidikanTerakhir);
    if (NamaSekolah) request.input('NamaSekolah', sql.VarChar, NamaSekolah);
    if (Jurusan) request.input('Jurusan', sql.VarChar, Jurusan);

    // Execute the query
    const result = await request.query(query);

    // Send the result back to the client
    res.json(result.recordset);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).send('An error occurred while retrieving data.');
  }
});

app.get('/getJobvacancies', async (req, res) => {
  try {
    // Ambil parameter dari body atau query string
    const { JobName, JobCategory, PostedDate, ClosingDate } = req.query;

    // Hubungkan ke database
    const pool = await sql.connect(dbConfig);

    // Buat query dengan kondisi WHERE dinamis
    let query = `
        SELECT
            [JobId] AS 'Id Pekerjaan',
            [JobName] AS 'Nama Pekerjaan',
            [Kualifikasi] AS 'Kualifikasi',
            [JobDescription] AS 'Deskripsi Pekerjaan',
            [JobCategory] AS 'Kategori Pekerjaan',
            [PostedDate] AS 'Tanggal Dibuka Lowongan',
            [ClosingDate] AS 'Tanggal Ditutup Lowongan'
        FROM [dbo].[JOB_VACANCIES_DATA]
    `;

    // Tambahkan filter berdasarkan parameter yang diberikan
    if (JobName) query += ` AND [JobName] LIKE '%${JobName}%'`;
    if (JobCategory) query += ` AND [JobCategory] = '${JobCategory}'`;
    if (PostedDate) query += ` AND [PostedDate] = '${PostedDate}'`;
    if (ClosingDate) query += ` AND [ClosingDate] = '${ClosingDate}'`;

    // Eksekusi query
    const result = await pool.request().query(query);

    // Fungsi untuk mengubah format tanggal
    const formatDate = (date) => {
      if (typeof date === 'string') {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const year = date.slice(0, 4);
        const month = monthNames[parseInt(date.slice(5, 7), 10) - 1];
        const day = date.slice(8, 10);

        return `${day} ${month} ${year}`;
      } else if (date instanceof Date) {
        const year = date.getFullYear();
        const month = date.toLocaleString('default', { month: 'long' });
        const day = String(date.getDate()).padStart(2, '0'); // Add leading zero if day < 10

        return `${day} ${month} ${year}`;
      }
      return date; // Return the original date if it is not a string or Date object
    };

    // Format tanggal-tanggal yang ada di hasil query
    result.recordset.forEach(item => {
      if (item['Tanggal Dibuka Lowongan']) {
        item['Tanggal Dibuka Lowongan'] = formatDate(item['Tanggal Dibuka Lowongan']);
      }
      if (item['Tanggal Ditutup Lowongan']) {
        item['Tanggal Ditutup Lowongan'] = formatDate(item['Tanggal Ditutup Lowongan']);
      }
    });

    // Kirim hasil query sebagai response
    res.json(result.recordset);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Terjadi kesalahan saat mengambil data.');
  }
});

app.post('/addJobVacancy', async (req, res) => {
  try {
    // Ambil data dari body request
    const { JobName, Kualifikasi, JobCategory, PostedDate, ClosingDate, JobDescription } = req.body;

    // Validasi input
    if (!JobName || !Kualifikasi || !JobCategory || !PostedDate || !ClosingDate) {
      return res.status(400).send('Semua field wajib diisi.');
    }

    // Hubungkan ke database
    const pool = await sql.connect(dbConfig);

    // Query untuk insert data
    const query = `
      INSERT INTO [dbo].[JOB_VACANCIES_DATA] (
        [JobName],
        [Kualifikasi],
        [JobCategory],
        [PostedDate],
        [ClosingDate],
        [JobDescription]
      )
      VALUES (@JobName, @Kualifikasi, @JobCategory, @PostedDate, @ClosingDate, @JobDescription)
    `;

    // Eksekusi query
    await pool.request()
      .input('JobName', sql.NVarChar, JobName)
      .input('Kualifikasi', sql.Text, Kualifikasi)
      .input('JobCategory', sql.NVarChar, JobCategory)
      .input('PostedDate', sql.Date, PostedDate)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('JobDescription', sql.Text, JobDescription)
      .query(query);

    // Kirim response sukses
    res.status(201).send('Lowongan pekerjaan berhasil ditambahkan.');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Terjadi kesalahan saat menambahkan data.');
  } finally {
    // Tutup koneksi database
    sql.close();
  }
});

app.post('/updateClosingDate', async (req, res) => {
  try {
    // Ambil data dari body request
    const { JobId, ClosingDate } = req.body;

    // Validasi input
    if (!JobId || !ClosingDate) {
      return res.status(400).send('JobId dan ClosingDate wajib diisi.');
    }

    // Hubungkan ke database
    const pool = await sql.connect(dbConfig);

    // Query untuk update ClosingDate berdasarkan JobId
    const query = `
      UPDATE [dbo].[JOB_VACANCIES_DATA]
      SET 
        [ClosingDate] = @ClosingDate
      WHERE [JobId] = @JobId
    `;

    // Eksekusi query
    const result = await pool.request()
      .input('JobId', sql.Int, JobId) // Gunakan JobId sebagai parameter
      .input('ClosingDate', sql.Date, ClosingDate)
      .query(query);

    // Periksa apakah ada data yang diupdate
    if (result.rowsAffected[0] === 0) {
      return res.status(404).send('Lowongan pekerjaan tidak ditemukan.');
    }

    // Kirim response sukses
    res.status(200).send('ClosingDate berhasil diperbarui.');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Terjadi kesalahan saat memperbarui ClosingDate.');
  } finally {
    // Tutup koneksi database
    sql.close();
  }
});


app.delete('/deleteJobvacancy', async (req, res) => {
  try {
    // Ambil parameter JobId dari body
    const { JobId } = req.body;

    // Validasi input
    if (!JobId) {
      return res.status(400).send('JobId harus disertakan.');
    }

    // Hubungkan ke database
    const pool = await sql.connect(dbConfig);

    // Buat query delete
    const query = `
        DELETE FROM [dbo].[JOB_VACANCIES_DATA]
        WHERE [JobId] = @JobId
    `;

    // Eksekusi query
    const result = await pool.request()
      .input('JobId', sql.Int, JobId)
      .query(query);

    // Kirim respons
    if (result.rowsAffected[0] > 0) {
      res.status(200).send(`Lowongan pekerjaan dengan JobId ${JobId} berhasil dihapus.`);
    } else {
      res.status(404).send(`Lowongan pekerjaan dengan JobId ${JobId} tidak ditemukan.`);
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Terjadi kesalahan saat menghapus data.');
  } finally {
    // Tutup koneksi database
    sql.close();
  }
});

const formatDate = (dateString) => {
  if (!dateString) return null; // Jika nilai kosong, langsung return null
  if (typeof dateString !== 'string') {
    dateString = dateString.toISOString(); // Pastikan dateString dalam format ISO string
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const [year, month, day] = dateString.split('T')[0].split('-');
  return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
};

app.get('/getCandidates', async (req, res) => {
  try {
    // Destructuring req.body
    const {
      jobName,
      jobCategory,
      postedDate,
      closingDate,
      provinsi,
      kabKota,
      kecamatan,
      desa,
      pendidikanTerakhir,
      jurusan,
      JenisKelamin,
      date
    } = req.body;

    // Membuat koneksi ke database
    const pool = await sql.connect(dbConfig);

    // Query tanpa menggunakan alias AS
    let query = `
      SELECT 
        CA.Date,
        CA.Status,
        CA.Sub_Status,
        CA.NIK,
        MUD.NOKK,
        MUD.NamaLengkap,
        MUD.TempatLahir,
        MUD.TanggalLahir,
        MUD.JenisKelamin,
        MUD.Agama,
        MUD.NoHandphone2,
        MUD.NoHandphone,
        MUD.Email,
        MUD.Kewarganegaraan,
        MUD.AlamatLengkap,
        MUD.Provinsi,
        MUD.KabKota,
        MUD.Kecamatan,
        MUD.Desa,
        MUD.RT,
        MUD.RW,
        MUD.KodePos,
        MUD.AlamatDomisili,
        MUD.StatusPernikahan,
        MUD.PendidikanTerakhir,
        MUD.NamaSekolah,
        MUD.Fakultas,
        MUD.Jurusan,
        MUD.Skill,
        MUD.CatatanDisabilitas,
        CA.JobId,
        JVD.JobName,
        JVD.JobCategory,
        JVD.PostedDate,
        JVD.ClosingDate,
        RK.NamaPerusahaan,
        RK.Jabatan,
        RK.Departemen,
        RK.MulaiKerja,
        RK.TerakhirKerja
      FROM [dbo].[CANDIDATE_APPLIES] CA
      INNER JOIN [dbo].[MAIN_USER_DATA] MUD ON CA.NIK = MUD.NIK
      INNER JOIN [dbo].[JOB_VACANCIES_DATA] JVD ON CA.JobId = JVD.JobId
      LEFT JOIN [JX2HRD].[dbo].[DOKUMEN_TAMBAHAN_USER_DATA] DTD ON MUD.NIK = DTD.NIK
      LEFT JOIN [JX2HRD].[dbo].[RIWAYAT_KERJA_USER_DATA] RK ON MUD.NIK = RK.NIK
    `;

    // Menambahkan filter dinamis berdasarkan body parameters
    const filters = [];
    if (jobName) filters.push(`JVD.JobName = @jobName`);
    if (jobCategory) filters.push(`JVD.JobCategory = @jobCategory`);
    if (postedDate) filters.push(`JVD.PostedDate >= @postedDate`);
    if (closingDate) filters.push(`JVD.ClosingDate <= @closingDate`);
    if (provinsi) filters.push(`MUD.Provinsi = @provinsi`);
    if (kabKota) filters.push(`MUD.KabKota = @kabKota`);
    if (JenisKelamin) filters.push(`MUD.JenisKelamin = @JenisKelamin`);
    if (kecamatan) filters.push(`MUD.Kecamatan = @kecamatan`);
    if (desa) filters.push(`MUD.Desa = @desa`);
    if (pendidikanTerakhir) filters.push(`MUD.PendidikanTerakhir = @pendidikanTerakhir`);
    if (jurusan) filters.push(`MUD.Jurusan = @jurusan`);

    // Tambahkan filter untuk CA.Date (tanggal tertentu)
    if (date) {
      filters.push(`CA.Date = @date`);
    }

    // Gabungkan filter ke query jika ada
    if (filters.length > 0) {
      query += ` WHERE ` + filters.join(' AND ');
    }

    // Membuat request object dan menambahkan parameter
    const request = pool.request();
    if (jobName) request.input('jobName', sql.NVarChar, jobName);
    if (jobCategory) request.input('jobCategory', sql.NVarChar, jobCategory);
    if (postedDate) request.input('postedDate', sql.Date, postedDate);
    if (closingDate) request.input('closingDate', sql.Date, closingDate);
    if (provinsi) request.input('provinsi', sql.NVarChar, provinsi);
    if (kabKota) request.input('kabKota', sql.NVarChar, kabKota);
    if (JenisKelamin) request.input('JenisKelamin', sql.NVarChar, JenisKelamin);
    if (kecamatan) request.input('kecamatan', sql.NVarChar, kecamatan);
    if (desa) request.input('desa', sql.NVarChar, desa);
    if (pendidikanTerakhir) request.input('pendidikanTerakhir', sql.NVarChar, pendidikanTerakhir);
    if (jurusan) request.input('jurusan', sql.NVarChar, jurusan);
    if (date) request.input('date', sql.Date, date); // Tambahkan parameter untuk tanggal tertentu

    // Eksekusi query
    const result = await request.query(query);

    // Proses data untuk mengelompokkan riwayat pekerjaan berdasarkan NIK, Date, dan JobId
    const candidates = {};
    result.recordset.forEach(row => {
      const uniqueKey = `${row.NIK}-${row.Date}-${row.JobId}`; // Gabungkan NIK, Date, dan JobId sebagai kunci unik
      if (!candidates[uniqueKey]) {
        candidates[uniqueKey] = {
          ...row,
          RiwayatPekerjaan: []
        };
      }
      if (row.NamaPerusahaan) {
        candidates[uniqueKey].RiwayatPekerjaan.push({
          NamaPerusahaan: row.NamaPerusahaan,
          Jabatan: row.Jabatan,
          Departemen: row.Departemen,
          MulaiKerja: row.MulaiKerja,
          TerakhirKerja: row.TerakhirKerja
        });
      }
    });

    // Kirim respons dengan data yang telah dikelompokkan
    res.status(200).json(candidates);
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).send('Error retrieving data');
  }
});

app.get('/getStatusPekerjaan', async (req, res) => {
  try {
    const { NIK } = req.query;

    // Validasi NIK
    if (!NIK || typeof NIK !== 'string' || NIK.trim() === '') {
      return res.status(400).json({ error: 'NIK is required and must be a valid string' });
    }

    const pool = await sql.connect(dbConfig);

    const query = `
      SELECT 
        CA.[Date],
        CA.[NIK] AS NIK,
        CA.[Status] AS Status,
        CA.[Sub_Status] AS 'Sub Status',
        JVD.[JobName],
        JVD.[JobCategory],
        JVD.[JobDescription],
        JVD.[Kualifikasi],
        JVD.[PostedDate],
        JVD.[ClosingDate]
      FROM [dbo].[CANDIDATE_APPLIES] CA
      INNER JOIN [dbo].[MAIN_USER_DATA] MUD ON CA.[NIK] = MUD.[NIK]
      INNER JOIN [dbo].[JOB_VACANCIES_DATA] JVD ON CA.[JobId] = JVD.[JobId]
      WHERE MUD.[NIK] = @NIK
    `;

    const request = pool.request();
    request.input('NIK', sql.VarChar, NIK);

    const result = await request.query(query);

    // Format hasil data
    const formattedResult = result.recordset.map(row => ({
      ...row,
      Date: row.Date ? formatDate(row.Date) : null,
      PostedDate: row.PostedDate ? formatDate(row.PostedDate) : null,
      ClosingDate: row.ClosingDate ? formatDate(row.ClosingDate) : null,
    }));

    res.status(200).json(formattedResult);
  } catch (error) {
    console.error('Error retrieving data:', error);

    // Kirim pesan kesalahan yang ramah
    res.status(500).json({ error: 'An error occurred while retrieving data. Please try again later.' });
  }
});

app.put('/updateStatusCandidate', async (req, res) => {
  try {
    const { NIK, JobId, Status } = req.body; // Data dikirimkan dalam request body

    if (!NIK || !JobId || !Status) {
      return res.status(400).send('NIK, JobId, dan Status wajib diisi');
    }

    const pool = await sql.connect(dbConfig);

    // Query untuk mengupdate kolom Status berdasarkan NIK dan JobId
    const query = `
      UPDATE [dbo].[CANDIDATE_APPLIES]
      SET [Status] = @Status
      WHERE [NIK] = @NIK AND [JobId] = @JobId
    `;

    const request = pool.request();
    request.input('NIK', sql.VarChar, NIK);
    request.input('JobId', sql.Int, JobId);
    request.input('Status', sql.VarChar, Status);

    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).send('Data tidak ditemukan untuk NIK dan JobId yang diberikan');
    }

    res.status(200).send('Status berhasil diperbarui');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating status');
  } finally {
    sql.close();
  }
});

app.put('/updateSubStatusCandidate', async (req, res) => {
  try {
    const { NIK, JobId, Sub_Status } = req.body; // Data dikirimkan dalam request body

    if (!NIK || !JobId || !Sub_Status) {
      return res.status(400).send('NIK, JobId, dan Sub Status wajib diisi');
    }

    const pool = await sql.connect(dbConfig);

    // Query untuk mengupdate kolom Status berdasarkan NIK dan JobId
    const query = `
      UPDATE [dbo].[CANDIDATE_APPLIES]
      SET [Sub_Status] = @Sub_Status
      WHERE [NIK] = @NIK AND [JobId] = @JobId
    `;

    const request = pool.request();
    request.input('NIK', sql.VarChar, NIK);
    request.input('JobId', sql.Int, JobId);
    request.input('Sub_Status', sql.VarChar, Sub_Status);

    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).send('Data tidak ditemukan untuk NIK dan JobId yang diberikan');
    }

    res.status(200).send('Status berhasil diperbarui');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating status');
  } finally {
    sql.close();
  }
});

app.post('/exportToXlsx', async (req, res) => {
  try {
    const {
      JobName,
      JobCategory,
      PostedDate,
      ClosingDate,
      Provinsi,
      KabKota,
      Kecamatan,
      Desa,
      PendidikanTerakhir,
      Jurusan
    } = req.body;

    let query = `
      SELECT 
        CA.Date,
        CA.Status,
        CA.NIK,
        MUD.NOKK,
        MUD.NamaLengkap,
        MUD.TempatLahir,
        MUD.TanggalLahir,
        MUD.JenisKelamin,
        MUD.Agama,
        MUD.NoHandphone2,
        MUD.NoHandphone,
        MUD.Email,
        MUD.Kewarganegaraan,
        MUD.AlamatLengkap,
        MUD.Provinsi,
        MUD.KabKota,
        MUD.Kecamatan,
        MUD.Desa,
        MUD.RT,
        MUD.RW,
        MUD.KodePos,
        MUD.AlamatDomisili,
        MUD.StatusPernikahan,
        MUD.PendidikanTerakhir,
        MUD.NamaSekolah,
        MUD.Fakultas,
        MUD.Jurusan,
        MUD.Skill,
        MUD.CatatanDisabilitas,
        CA.JobId,
        JVD.JobName,
        JVD.JobCategory,
        JVD.PostedDate,
        JVD.ClosingDate
      FROM dbo.CANDIDATE_APPLIES CA
      INNER JOIN dbo.MAIN_USER_DATA MUD ON CA.NIK = MUD.NIK
      INNER JOIN dbo.JOB_VACANCIES_DATA JVD ON CA.JobId = JVD.JobId
    `;

    const filters = [];
    if (JobName) filters.push(`JVD.JobName = @JobName`);
    if (JobCategory) filters.push(`JVD.JobCategory = @JobCategory`);
    if (PostedDate) filters.push(`JVD.PostedDate >= @PostedDate`);
    if (ClosingDate) filters.push(`JVD.ClosingDate <= @ClosingDate`);
    if (Provinsi) filters.push(`MUD.Provinsi = @Provinsi`);
    if (KabKota) filters.push(`MUD.KabKota = @KabKota`);
    if (Kecamatan) filters.push(`MUD.Kecamatan = @Kecamatan`);
    if (Desa) filters.push(`MUD.Desa = @Desa`);
    if (PendidikanTerakhir) filters.push(`MUD.PendidikanTerakhir = @PendidikanTerakhir`);
    if (Jurusan) filters.push(`MUD.Jurusan = @Jurusan`);

    if (filters.length > 0) {
      query += ` WHERE ` + filters.join(' AND ');
    }

    const pool = await sql.connect(dbConfig);
    const request = pool.request();
    if (JobName) request.input('JobName', sql.NVarChar, JobName);
    if (JobCategory) request.input('JobCategory', sql.NVarChar, JobCategory);
    if (PostedDate) request.input('PostedDate', sql.Date, PostedDate);
    if (ClosingDate) request.input('ClosingDate', sql.Date, ClosingDate);
    if (Provinsi) request.input('Provinsi', sql.NVarChar, Provinsi);
    if (KabKota) request.input('KabKota', sql.NVarChar, KabKota);
    if (Kecamatan) request.input('Kecamatan', sql.NVarChar, Kecamatan);
    if (Desa) request.input('Desa', sql.NVarChar, Desa);
    if (PendidikanTerakhir) request.input('PendidikanTerakhir', sql.NVarChar, PendidikanTerakhir);
    if (Jurusan) request.input('Jurusan', sql.NVarChar, Jurusan);

    const result = await request.query(query);
    const rows = result.recordset;

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Data Lamaran');

    const fileBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename=lamaran_pekerjaan.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    res.send(fileBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing request');
  }
});

app.post('/downloadFile', async (req, res) => {
  try {
    const { nik } = req.body;

    if (!nik) {
      return res.status(400).send({ message: 'NIK is required' });
    }

    const filePath = path.join(__dirname, 'data', 'Dokumen', `${nik}_Dokumen.pdf`);

    if (!fsSync.existsSync(filePath)) {
      return res.status(404).send({ message: 'File not found' });
    }

    res.download(filePath, `${nik}_Dokumen.pdf`, (err) => {
      if (err) {
        console.error('Error during file download:', err);
        res.status(500).send({ message: 'Error downloading file' });
      }
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send({ message: 'Internal Server Error' });
  }
});

app.post('/downloadDocuments', async (req, res) => {
  const {
    JobName,
    JobCategory,
    PostedDate,
    ClosingDate,
    Provinsi,
    KabKota,
    Kecamatan,
    Desa,
    PendidikanTerakhir,
    Jurusan,
  } = req.body;

  try {
    // Membuat koneksi ke database
    const pool = await sql.connect(dbConfig);

    // Query awal untuk mendapatkan NIK
    let query = `
      SELECT 
        CA.NIK
      FROM CANDIDATE_APPLIES CA
      INNER JOIN MAIN_USER_DATA MUD ON CA.NIK = MUD.NIK
      INNER JOIN JOB_VACANCIES_DATA JVD ON CA.JobId = JVD.JobId
    `;

    // Menambahkan filter query jika parameter ada
    const filters = [];
    if (JobName) filters.push(`JVD.JobName = @JobName`);
    if (JobCategory) filters.push(`JVD.JobCategory = @JobCategory`);
    if (PostedDate) filters.push(`JVD.PostedDate >= @PostedDate`);
    if (ClosingDate) filters.push(`JVD.ClosingDate <= @ClosingDate`);
    if (Provinsi) filters.push(`MUD.Provinsi = @Provinsi`);
    if (KabKota) filters.push(`MUD.KabKota = @KabKota`);
    if (Kecamatan) filters.push(`MUD.Kecamatan = @Kecamatan`);
    if (Desa) filters.push(`MUD.Desa = @Desa`);
    if (PendidikanTerakhir) filters.push(`MUD.PendidikanTerakhir = @PendidikanTerakhir`);
    if (Jurusan) filters.push(`MUD.Jurusan = @Jurusan`);

    if (filters.length > 0) {
      query += ` WHERE ` + filters.join(' AND ');
    }

    const request = pool.request();
    if (JobName) request.input('JobName', sql.NVarChar, JobName);
    if (JobCategory) request.input('JobCategory', sql.NVarChar, JobCategory);
    if (PostedDate) request.input('PostedDate', sql.Date, PostedDate);
    if (ClosingDate) request.input('ClosingDate', sql.Date, ClosingDate);
    if (Provinsi) request.input('Provinsi', sql.NVarChar, Provinsi);
    if (KabKota) request.input('KabKota', sql.NVarChar, KabKota);
    if (Kecamatan) request.input('Kecamatan', sql.NVarChar, Kecamatan);
    if (Desa) request.input('Desa', sql.NVarChar, Desa);
    if (PendidikanTerakhir) request.input('PendidikanTerakhir', sql.NVarChar, PendidikanTerakhir);
    if (Jurusan) request.input('Jurusan', sql.NVarChar, Jurusan);

    const result = await request.query(query);
    const nikList = result.recordset.map(row => row.NIK);

    if (nikList.length === 0) {
      return res.status(404).send({ message: 'No NIK found in database' });
    }

    // Menentukan lokasi file berdasarkan NIK
    const folderPath = path.join(__dirname, 'data', 'Dokumen');
    const filesToArchive = nikList
      .map(nik => path.join(folderPath, `${nik}_Dokumen.pdf`))
      .filter(filePath => fsSync.existsSync(filePath));

    if (filesToArchive.length === 0) {
      return res.status(404).send({ message: 'No files found for the provided NIKs' });
    }

    // Membuat file arsip
    const archivePath = path.join(folderPath, 'Dokumen.zip');
    const output = fsSync.createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`Archive created: ${archivePath} (${archive.pointer()} bytes)`);
      res.download(archivePath, 'Dokumen.zip', err => {
        if (err) {
          console.error('Error during file download:', err);
          res.status(500).send({ message: 'Error downloading archive' });
        }
      });
    });

    archive.on('error', err => {
      console.error('Error creating archive:', err);
      res.status(500).send({ message: 'Error creating archive' });
    });

    archive.pipe(output);

    filesToArchive.forEach(file => {
      const fileName = path.basename(file);
      archive.file(file, { name: fileName });
    });

    await archive.finalize();
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send({ message: 'Internal Server Error' });
  }
});

app.get('/viewFile', async (req, res) => {
  try {
    const { nik } = req.query; // Menggunakan query parameter karena lebih cocok untuk "view"

    if (!nik) {
      return res.status(400).send({ message: 'NIK is required' });
    }

    const filePath = path.join(__dirname, 'data', 'Dokumen', `${nik}_Dokumen.pdf`);

    if (!fsSync.existsSync(filePath)) {
      return res.status(404).send({ message: 'File not found' });
    }

    // Set header untuk menampilkan dokumen PDF di browser
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline'); // "inline" untuk menampilkan, bukan mendownload

    const fileStream = fsSync.createReadStream(filePath);
    fileStream.pipe(res); // Mengalirkan file ke respons
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send({ message: 'Internal Server Error' });
  }
});


const PORT = 4005;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});